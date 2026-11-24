// REFERENCE Express gateway: login (app JWT) -> RBAC -> Prisma writes -> service JWT -> Python RAG service.
// It exists to contract-test the Python service. It is NOT the software team's backend.
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";

export const hashPassword = (pw) => { const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString("hex")}`; };
const checkPassword = (pw, stored) => { const [salt, h] = stored.split(":");
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), crypto.scryptSync(pw, salt, 32)); };
const ADMIN_ROLES = ["ADMIN", "LIBRARIAN"];

export function createApp({ prisma, ragUrl, appSecret, serviceSecret }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // service token exactly as documented in docs/INTEGRATION.md §2
  const ragToken = (user) => jwt.sign(
    { sub: String(user.sub), role: user.role, scope: ADMIN_ROLES.includes(user.role) ? "rag:read rag:admin" : "rag:read" },
    serviceSecret, { algorithm: "HS256", issuer: "sadat-express", audience: "sadat-rag", expiresIn: 300 });

  async function rag(user, method, path, body) {
    const r = await fetch(ragUrl + path, { method, headers: { Authorization: `Bearer ${ragToken(user)}`,
      ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  const relay = (method, mapPath) => async (req, res) => {
    const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    const out = await rag(req.user, method, mapPath(req) + (method === "GET" ? qs : ""), method === "POST" ? req.body : undefined);
    res.status(out.status).json(out.body);
  };

  const auth = (req, res, next) => {
    const h = req.headers.authorization || "";
    try { req.user = jwt.verify(h.replace(/^Bearer /, ""), appSecret, { algorithms: ["HS256"] }); next(); }
    catch { res.status(401).json({ error: { code: "unauthorized", message: "Login required" } }); }
  };
  const requireRole = (...roles) => (req, res, next) =>
    roles.includes(req.user.role) ? next() : res.status(403).json({ error: { code: "forbidden", message: "Insufficient role" } });

  app.post("/api/auth/login", async (req, res) => {
    const u = await prisma.user.findUnique({ where: { email: String(req.body?.email || "") } });
    if (!u || !checkPassword(String(req.body?.password || ""), u.passwordHash))
      return res.status(401).json({ error: { code: "bad_credentials", message: "Wrong email or password" } });
    res.json({ token: jwt.sign({ sub: u.id, role: u.role }, appSecret, { algorithm: "HS256", expiresIn: "1h" }) });
  });

  // ---- read side: every role may search; the browser never talks to the Python service
  app.get("/api/search", auth, relay("GET", () => "/search"));
  app.get("/api/supervisors/records", auth, relay("GET", () => "/supervisors/records"));
  app.get("/api/students/records", auth, relay("GET", () => "/students/records"));
  app.get("/api/records/:id", auth, relay("GET", (r) => `/records/${encodeURIComponent(r.params.id)}`));
  app.post("/api/ask", auth, relay("POST", () => "/ask"));

  // ---- write side: PostgreSQL (via Prisma) is authoritative; the RAG index is told afterwards
  const toData = (b) => ({ bookCode: String(b.bookCode), title: String(b.title), students: b.students ?? [],
    supervisors: b.supervisors ?? [], publishingDate: b.publishingDate != null ? String(b.publishingDate) : null,
    callNum: b.callNum ?? null, extent: b.extent ?? null, dimension: b.dimension ?? null, subjectsAll: b.subjects ?? [] });
  const sync = (user, code) => rag(user, "POST", `/admin/sync/records/${encodeURIComponent(code)}`);

  app.post("/api/projects", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
    if (!req.body?.bookCode || !req.body?.title)
      return res.status(422).json({ error: { code: "validation_error", message: "bookCode and title are required" } });
    try { const p = await prisma.project.create({ data: toData(req.body) });
      res.status(201).json({ project: p, rag: (await sync(req.user, p.bookCode)).body });
    } catch (e) { res.status(e.code === "P2002" ? 409 : 500).json({ error: { code: e.code === "P2002" ? "duplicate_book_code" : "server_error", message: "Could not create project" } }); }
  });
  app.patch("/api/projects/:code", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
    try { const d = toData({ bookCode: req.params.code, title: "x", ...req.body }); if (!req.body.title) delete d.title;
      delete d.bookCode; const p = await prisma.project.update({ where: { bookCode: req.params.code }, data: d });
      res.json({ project: p, rag: (await sync(req.user, p.bookCode)).body });
    } catch { res.status(404).json({ error: { code: "record_not_found", message: "No such project" } }); }
  });
  app.delete("/api/projects/:code", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
    try { await prisma.project.delete({ where: { bookCode: req.params.code } });
      res.json({ deleted: req.params.code, rag: (await sync(req.user, req.params.code)).body });
    } catch { res.status(404).json({ error: { code: "record_not_found", message: "No such project" } }); }
  });
  // admin-only pass-through for the index tools
  app.post("/api/admin/sync", auth, requireRole(...ADMIN_ROLES), async (req, res) => {
    const out = await rag(req.user, "POST", "/admin/sync"); res.status(out.status).json(out.body); });
  return app;
}
