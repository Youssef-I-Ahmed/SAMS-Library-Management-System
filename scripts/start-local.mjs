import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer as createTcpServer } from 'node:net';
import { execFileSync } from 'node:child_process';

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
// Detect conflicting servers before stopping or replacing the Book RAG runtime.
for (const [host, port] of [['127.0.0.1', 4000], ['localhost', 5173]]) {
  await new Promise((resolvePort, rejectPort) => {
    const probe = createTcpServer();
    probe.once('error', () => rejectPort(new Error(
      `Port ${port} is already in use. Stop the previous server or run Start-Local.ps1 -Restart.`
    )));
    probe.listen(port, host, () => probe.close(resolvePort));
  });
}
const mapPath = resolve(root, 'data/demo/legacy-book-code-map.json');
const map = readFileSync(mapPath);
let key;
// Keep already loaded local models warm across API/frontend restarts. The
// existing service key is transferred in process memory only, never to a file,
// command argument, Docker configuration or console output.
try {
  const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name],
    { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }))[0];
  const existing = inspect('sams-book-rag-10d3');
  const ingress = inspect('sams-book-rag-10d3-ingress');
  if ([existing, ingress].every(item => item.State.Running
    && item.Config.Labels?.['sams.book-rag.sprint'] === '10d3')
    && existing.Config.Env.includes('LLM_PROVIDER=extractive')) {
    const candidate = execFileSync('docker', ['exec', 'sams-book-rag-10d3', 'python', '-c',
      "from pathlib import Path; e=dict(x.split(b'=',1) for x in Path('/proc/1/environ').read_bytes().split(b'\\0') if b'=' in x); print(e[b'API_SERVICE_KEY'].decode())"],
      { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const health = await fetch('http://127.0.0.1:18000/api/health', {
      headers: { 'X-Service-Key': candidate }, signal: AbortSignal.timeout(5000)
    });
    if (candidate.length >= 32 && health.ok) key = candidate;
  }
} catch { /* A cold or unavailable runtime is launched normally below. */ }
const reuseRag = Boolean(key);
key ||= randomBytes(48).toString('hex');
const reader = new URL('postgresql://127.0.0.1:5433/sams_library');
reader.username = 'sams_research_rag_ro';
reader.password = local.researchPassword;
Object.assign(process.env, {
  NODE_ENV: 'development', DEV_AUTH_ENABLED: 'true', API_PORT: '4000',
  DEMO_AUTH_ENABLED: 'true', AUTH_TOKEN_EXPIRES_IN: '7d',
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
let rag;
if (!reuseRag) {
  stopContainer('sams-book-rag-10d3');
  rag = startContainer({ password: local.bookPassword, key, models: local.models });
}
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
console.log(reuseRag ? 'Book RAG reused: local models are ready.' : 'Book RAG is loading local models.');
console.log('Local presentation login enabled for Student, Librarian and Management.');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.allSettled([api.shutdown(), web.close()]);
  if (rag) stopContainer('sams-book-rag-10d3');
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
rag?.once('exit', (code) => {
  if (!stopping) console.error('Book RAG stopped with exit code', code);
});
