import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { normalizeCatalogText } from '../catalog/catalog-search.js';
import { unavailable } from './ai-errors.js';

const ROLE = 'sams_research_rag_ro';
const MAX_ROWS = 12_000;
const MAX_MATCHES = 5;
const STOP_WORDS = new Set(
  ('a an and are about find for from i in me of on or show the to with you project projects research thesis theses graduation ' +
    'ابحث البحث اريد عايز عاوز اعرض عن علي في من او و ما هل لي مشروعات مشاريع مشروع تخرج رساله رسائل بحث بحوث علميه اسم بعنوان').split(' ')
);

function tokens(text) {
  return normalizeCatalogText(text).split(' ')
    .map((word) => /^ال\p{Script=Arabic}{3,}$/u.test(word) ? word.slice(2) : word)
    .filter((word) => word && !STOP_WORDS.has(word));
}

export function buildResearchIndex(rows) {
  return rows.map((row) => ({
    row,
    code: normalizeCatalogText(row.legacy_code),
    title: normalizeCatalogText(row.title),
    terms: new Set(tokens([row.title, row.legacy_code, row.call_number, row.publication_year,
      ...row.subjects, ...row.researchers, ...row.supervisors].join(' ')))
  }));
}

export function searchResearchIndex(index, question) {
  const phrase = normalizeCatalogText(question);
  if (!phrase) return [];
  const words = [...new Set(tokens(question))];
  return index.map((entry) => {
    const hits = words.filter((word) => entry.terms.has(word)).length;
    let score = hits > 0 && hits >= Math.ceil(words.length / 2) ? hits : 0;
    if (entry.title.includes(phrase)) score += 10;
    if (entry.title === phrase || entry.code === phrase) score += 100;
    return { row: entry.row, score };
  }).filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MATCHES)
    .map(({ row }) => row);
}

async function fetchCatalog(db) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '3500ms'`;
    const [guard] = await tx.$queryRaw`
      SELECT current_user::text = ${ROLE} AND NOT (rolsuper OR rolcreatedb OR rolcreaterole
        OR rolreplication OR rolbypassrls) AND current_setting('transaction_read_only') = 'on'
        AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = pg_roles.oid)
        AND NOT has_schema_privilege(current_user, 'sams_research', 'CREATE')
        AND NOT has_table_privilege(current_user, 'sams_research.catalog', 'INSERT,UPDATE,DELETE,TRUNCATE')
        AND NOT EXISTS (
          SELECT 1 FROM pg_class AS relation
          JOIN pg_namespace AS ns ON ns.oid = relation.relnamespace
          WHERE ns.nspname = 'public' AND relation.relkind IN ('r','p','v','m','f')
            AND has_table_privilege(current_user, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
        ) AS safe
      FROM pg_roles WHERE rolname = current_user`;
    if (!guard?.safe) throw unavailable();
    return tx.$queryRaw`
      SELECT id, title, legacy_code, publication_year, language, call_number,
        subjects, researchers, supervisors, available
      FROM sams_research.catalog ORDER BY id LIMIT ${MAX_ROWS + 1}`;
  }, { maxWait: 2000, timeout: 4500 });
}

function connect(connection) {
  if (!connection) return null;
  try {
    const url = new URL(connection);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
        decodeURIComponent(url.username) !== ROLE || !url.password) return null;
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('connect_timeout', '3');
    return new PrismaClient({ datasourceUrl: url.href, log: [], errorFormat: 'minimal' });
  } catch {
    return null;
  }
}

export function createResearchRag({ connection, load, now = Date.now, refreshMs = 5000 } = {}) {
  const db = load ? null : connect(connection);
  const fetchRows = load ?? (db && (() => fetchCatalog(db)));
  let active = null;
  let refreshedAt = null;
  let timer;
  let refreshing;

  function refresh() {
    if (!fetchRows) return Promise.resolve();
    refreshing ??= (async () => {
      try {
        const rows = await fetchRows();
        if (rows.length > MAX_ROWS) throw unavailable();
        const revision = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
        if (active?.revision !== revision) active = { revision, index: buildResearchIndex(rows) };
        refreshedAt = now();
      } catch {
        // Fail closed on a role error, unavailable DB or invalid snapshot.
        active = null;
      }
    })().finally(() => { refreshing = undefined; });
    return refreshing;
  }

  function start() {
    if (fetchRows && !timer) {
      timer = setInterval(refresh, refreshMs);
      timer.unref();
      return refresh();
    }
    return refreshing;
  }

  async function current() {
    await start();
    if (!active || now() - refreshedAt > refreshMs * 3) throw unavailable();
    return active;
  }

  return {
    start,
    async stop() {
      clearInterval(timer);
      timer = undefined;
      await refreshing;
      await db?.$disconnect();
      active = null;
    },
    async health() {
      const { index } = await current();
      return { status: 'ok', indexedCount: index.length, lastRefresh: new Date(refreshedAt).toISOString() };
    },
    async ask(question) {
      const { index } = await current();
      // Ground the reply in the approved projection. No data or credentials
      // leave the service for model inference and questions never become SQL.
      const results = searchResearchIndex(index, question);
      return { status: results.length ? 'success' : 'no-results', results };
    }
  };
}

export const researchRag = createResearchRag({ connection: process.env.RESEARCH_RAG_DATABASE_URL });
