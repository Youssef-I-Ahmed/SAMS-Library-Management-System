import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const local = JSON.parse(readFileSync(0, 'utf8').replace(/^\uFEFF/, ''));
if (!local.bookPassword || !local.researchPassword || !local.models) {
  throw new Error('Local Book and Research RAG credentials and models are required.');
}
process.loadEnvFile(resolve(root, '.env'));
const database = new URL(process.env.DATABASE_URL);
if (!['localhost', '127.0.0.1'].includes(database.hostname)
    || database.port !== '5433' || database.pathname !== '/sams_library') {
  throw new Error('The local SAMS database on port 5433 is required.');
}
const mapPath = resolve(root, 'data/demo/legacy-book-code-map.json');
const map = readFileSync(mapPath);
const key = randomBytes(48).toString('hex');
const reader = new URL('postgresql://127.0.0.1:5433/sams_library');
reader.username = 'sams_research_rag_ro';
reader.password = local.researchPassword;
Object.assign(process.env, {
  NODE_ENV: 'development', DEV_AUTH_ENABLED: 'true', API_PORT: '4000',
  WEB_ORIGIN: 'http://localhost:5173', REQUEST_LOGGING: 'false',
  AI_ENABLED: 'true', RAG_URL: 'http://127.0.0.1:18000', RAG_SERVICE_KEY: key,
  AI_BOOK_CODE_MAP_PATH: mapPath,
  AI_BOOK_CODE_MAP_SHA256: createHash('sha256').update(map).digest('hex'),
  AI_SOURCE_SHA256: JSON.parse(map).sourceSha256,
  AI_SERVICE_EPOCH: randomUUID(), AI_BOOK_IDENTITY_MODE: 'postgres_uuid',
  RESEARCH_RAG_DATABASE_URL: reader.href
});
const load = (path) => import(pathToFileURL(resolve(root, path)).href);
const { prepareResources, attachPostgres, startContainer, stopContainer } =
  await load('services/book-rag/run-container.mjs');
prepareResources();
attachPostgres('sams_book_rag_internal_10d3');
stopContainer('sams-book-rag-10d3');
const rag = startContainer({ password: local.bookPassword, key, models: local.models });
local.bookPassword = local.researchPassword = undefined;
const { startHttpServer } = await load('apps/api/src/runtime/http-server.js');
const api = await startHttpServer({ host: '127.0.0.1', port: 4000 });
const { createServer } = await load('node_modules/vite/dist/node/index.js');
const web = await createServer({
  root: resolve(root, 'apps/web'),
  define: { 'import.meta.env.VITE_AI_ASSISTANT_ENABLED': '"true"',
    'import.meta.env.VITE_API_URL': '"http://127.0.0.1:4000/api/v1"' },
  server: { host: 'localhost', port: 5173, strictPort: true }
});
await web.listen();
console.log('SAMS local: http://localhost:5173 | API: http://127.0.0.1:4000/api/v1');
console.log('Book RAG is loading local models; Research RAG is enabled.');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([api.shutdown(), web.close()]);
  stopContainer('sams-book-rag-10d3');
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
rag.once('exit', (code) => {
  if (!stopping) console.error('Book RAG stopped with exit code', code);
});
