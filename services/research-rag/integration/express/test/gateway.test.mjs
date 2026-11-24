// End-to-end contract tests: real HTTP -> reference Express gateway -> real Python RAG service (integrated mode) -> real
// PostgreSQL (Prisma writes). Ground truth comes from the Excel file (computed independently by the orchestrator).
import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, describe, test } from "node:test";
import jwt from "jsonwebtoken";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.ts";
import { createApp, hashPassword } from "../src/app.mjs";

const { DATABASE_URL, RAG_URL, SERVICE_JWT_SECRET, APP_JWT_SECRET, EXPECT_JSON } = process.env;
const expect = JSON.parse(fs.readFileSync(EXPECT_JSON, "utf8"));
let prisma, server, base;
const tok = {};

const call = async (method, path, { token, body } = {}) => {
  const r = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const login = async (email) => (await call("POST", "/api/auth/login", { body: { email, password: "pw-" + email } })).json.token;
const ragDirect = async (method, path, claims, secret = SERVICE_JWT_SECRET, body = {}) => {
  const t = jwt.sign(claims, secret, { algorithm: "HS256", issuer: "sadat-express", audience: "sadat-rag", expiresIn: 60 });
  const r = await fetch(RAG_URL + path, { method, headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

before(async () => {
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
  for (const [email, role] of [["admin@t", "ADMIN"], ["lib@t", "LIBRARIAN"], ["student@t", "STUDENT"]])
    await prisma.user.upsert({ where: { email }, update: {}, create: { email, role, passwordHash: hashPassword("pw-" + email) } });
  const app = createApp({ prisma, ragUrl: RAG_URL, appSecret: APP_JWT_SECRET, serviceSecret: SERVICE_JWT_SECRET });
  await new Promise((ok) => { server = app.listen(0, "127.0.0.1", ok); });
  base = `http://127.0.0.1:${server.address().port}`;
  tok.admin = await login("admin@t"); tok.lib = await login("lib@t"); tok.student = await login("student@t");
});
after(async () => { server?.close(); await prisma?.$disconnect(); });

describe("authentication and RBAC through Express", () => {
  test("no token / bad password / forged token -> 401", async () => {
    assert.equal((await call("GET", "/api/search?q=x")).status, 401);
    assert.equal((await call("POST", "/api/auth/login", { body: { email: "admin@t", password: "wrong" } })).status, 401);
    const forged = jwt.sign({ sub: 1, role: "ADMIN" }, "not-the-secret");
    assert.equal((await call("GET", "/api/search?q=x", { token: forged })).status, 401);
  });
  test("a STUDENT can search but cannot write", async () => {
    assert.equal((await call("GET", "/api/search?q=التسويق&mode=hybrid", { token: tok.student })).status, 200);
    const w = await call("POST", "/api/projects", { token: tok.student, body: { bookCode: "X1", title: "no" } });
    assert.equal(w.status, 403); assert.equal(w.json.error.code, "forbidden");
    assert.equal((await call("DELETE", "/api/projects/1", { token: tok.student })).status, 403);
  });
  test("Python service enforces its own scopes: read token on /admin -> 403; wrong secret / role -> 401/403", async () => {
    assert.equal((await ragDirect("POST", "/admin/sync", { sub: "9", role: "STUDENT", scope: "rag:read" })).status, 403);
    assert.equal((await ragDirect("POST", "/admin/sync", { sub: "9", role: "ADMIN", scope: "rag:read rag:admin" }, "x".repeat(40))).status, 401);
    assert.equal((await ragDirect("POST", "/admin/sync", { sub: "9", role: "STUDENT", scope: "rag:read rag:admin" })).status, 403);
  });
});

describe("search results through Express equal the Excel ground truth (PostgreSQL-backed index)", () => {
  test("service is in integrated mode with every source row indexed", async () => {
    const r = await fetch(RAG_URL + "/ready"); const j = await r.json();
    assert.equal(r.status, 200); assert.equal(j.records, expect.records);
    const direct = await ragDirect("POST", "/admin/records", { sub: "1", role: "ADMIN", scope: "rag:read rag:admin" }, SERVICE_JWT_SECRET, { title: "direct write must be refused" });
    assert.equal(direct.status, 409); assert.equal(direct.json.error.code, "records_managed_externally");
    assert.equal(await prisma.project.count(), expect.records);
  });
  test("complete supervisor list: lossless pagination equals the oracle", async () => {
    const ids = new Set(); let page = 1, total;
    for (;;) {
      const r = await call("GET", `/api/supervisors/records?name=${encodeURIComponent(expect.supervisor.name)}&page=${page}&page_size=100`, { token: tok.student });
      assert.equal(r.status, 200); total = r.json.total; r.json.hits.forEach((h) => ids.add(h.record_id));
      if (page >= r.json.total_pages) break; page++;
    }
    assert.equal(total, expect.supervisor.count); assert.equal(ids.size, expect.supervisor.count);
  });
  test("complete student list equals the oracle (names never merged)", async () => {
    const r = await call("GET", `/api/students/records?name=${encodeURIComponent(expect.student.name)}&page_size=100`, { token: tok.student });
    assert.equal(r.status, 200); assert.equal(r.json.total, expect.student.count);
    assert.deepEqual(r.json.hits.map((h) => h.record_id).sort(), [...expect.student.ids].sort());
  });
  test("exact title lookup, Arabic spelling variant, record detail with original values", async () => {
    const r = await call("GET", `/api/search?q=${encodeURIComponent(expect.title.text)}&mode=title`, { token: tok.student });
    assert.ok(r.json.hits.some((h) => h.record_id === expect.title.id && h.match_type === "exact"));
    const d = await call("GET", `/api/records/${expect.title.id}`, { token: tok.student });
    assert.equal(d.status, 200); assert.equal(d.json.title, expect.title.original);
    const v = await call("GET", `/api/supervisors/records?name=${encodeURIComponent(expect.supervisor.variant)}&page_size=1`, { token: tok.student });
    assert.equal(v.json.total, expect.supervisor.count);
  });
  test("short / empty / nonsense queries are safe (200, no hits, no stack trace)", async () => {
    for (const q of ["ا", "zzzqqq", "'; DROP TABLE projects;--"]) {
      const r = await call("GET", `/api/search?q=${encodeURIComponent(q)}&mode=student`, { token: tok.student });
      assert.equal(r.status, 200); assert.equal(r.json.total, 0); assert.ok(!JSON.stringify(r.json).includes("Traceback"));
    }
    assert.equal(await prisma.project.count(), expect.records);          // the injection string changed nothing
  });
  test("/ask is retrieval-only, cites real records and does not claim an LLM", async () => {
    const r = await call("POST", "/api/ask", { token: tok.student, body: { question: "ما هي المشروعات المتعلقة بالتسويق الإلكتروني؟" } });
    assert.equal(r.status, 200); assert.notEqual(r.json.generated_by, "llm"); assert.ok(r.json.sources.length > 0);
    assert.ok(r.json.warnings.join(" ").includes("retrieval-only"));
  });
});

describe("authoritative writes: Prisma -> PostgreSQL -> Express -> RAG sync", () => {
  const code = "IT-9001", title = "عنوان تكامل فريد للاختبار عبر اكسبرس", title2 = "عنوان تكامل معدل للاختبار عبر اكسبرس";
  test("create -> searchable; duplicate/invalid rejected; edit; delete -> gone; nothing else changed", async () => {
    const before = await prisma.project.count();
    const bad = await call("POST", "/api/projects", { token: tok.lib, body: { bookCode: code } });
    assert.equal(bad.status, 422);
    const c = await call("POST", "/api/projects", { token: tok.lib, body: { bookCode: code, title, students: ["طالب تكامل فريد"], supervisors: ["مشرف تكامل فريد"], publishingDate: 2024, subjects: ["بنوك"] } });
    assert.equal(c.status, 201); assert.equal(c.json.rag.operation, "created");
    assert.equal((await call("POST", "/api/projects", { token: tok.lib, body: { bookCode: code, title: "again" } })).status, 409);
    assert.equal((await call("GET", `/api/search?q=${encodeURIComponent(title)}&mode=title`, { token: tok.student })).json.total, 1);
    assert.equal((await call("GET", `/api/students/records?name=${encodeURIComponent("طالب تكامل فريد")}`, { token: tok.student })).json.total, 1);
    assert.equal((await call("GET", `/api/supervisors/records?name=${encodeURIComponent("مشرف تكامل فريد")}`, { token: tok.student })).json.total, 1);
    const e = await call("PATCH", `/api/projects/${code}`, { token: tok.admin, body: { title: title2 } });
    assert.equal(e.status, 200); assert.equal(e.json.rag.operation, "updated");
    assert.equal((await call("GET", `/api/search?q=${encodeURIComponent(title)}&mode=title`, { token: tok.student })).json.total, 0);
    assert.equal((await call("GET", `/api/search?q=${encodeURIComponent(title2)}&mode=title`, { token: tok.student })).json.total, 1);
    assert.equal((await prisma.project.findUnique({ where: { bookCode: code } })).title, title2);
    const d = await call("DELETE", `/api/projects/${code}`, { token: tok.admin });
    assert.equal(d.status, 200); assert.equal(d.json.rag.operation, "deleted");
    assert.equal((await call("GET", `/api/search?q=${encodeURIComponent(title2)}&mode=title`, { token: tok.student })).json.total, 0);
    assert.equal((await call("DELETE", `/api/projects/${code}`, { token: tok.admin })).status, 404);
    assert.equal(await prisma.project.count(), before);
    const sup = await call("GET", `/api/supervisors/records?name=${encodeURIComponent(expect.supervisor.name)}&page_size=1`, { token: tok.student });
    assert.equal(sup.json.total, expect.supervisor.count);                 // unrelated results unchanged
  });
  test("admin full sync reconciles the whole view and reports no change", async () => {
    const r = await call("POST", "/api/admin/sync", { token: tok.admin });
    assert.equal(r.status, 200); assert.equal(r.json.source_records, expect.records);
  });
});
