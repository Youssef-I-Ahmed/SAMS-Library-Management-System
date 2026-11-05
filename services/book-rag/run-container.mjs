// Docker configuration contains non-secret fields only. Secrets enter PID 1 on stdin.
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const serviceRoot = fileURLToPath(new URL('.', import.meta.url));
export const repoRoot = resolve(serviceRoot, '../..');
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
const owner = 'sams.book-rag.sprint=10d3';

export function prepareResources(network = 'sams_book_rag_internal_10d3', store = 'sams_book_rag_store_10d3') {
  for (const [kind, name, args] of [
    ['network', network, ['--internal', '--driver', 'bridge']], ['volume', store, []]
  ]) {
    let exists = true;
    try { docker(kind, 'inspect', name); } catch { exists = false; }
    if (!exists) docker(kind, 'create', '--label', owner, ...args, name);
    const info = JSON.parse(docker(kind, 'inspect', name))[0];
    if (info.Labels?.['sams.book-rag.sprint'] !== '10d3' || (kind === 'network' && !info.Internal)) {
      throw new Error('Runtime resource ownership/isolation mismatch');
    }
  }
  const ingress = 'sams_book_rag_ingress_10d3';
  let exists = true;
  try { docker('network', 'inspect', ingress); } catch { exists = false; }
  if (!exists) docker('network', 'create', '--label', owner, '--driver', 'bridge', ingress);
  const info = JSON.parse(docker('network', 'inspect', ingress))[0];
  if (info.Labels?.['sams.book-rag.sprint'] !== '10d3' || info.Internal) throw new Error('Ingress ownership mismatch');
}

export function stopContainer(name) {
  for (const target of [name+'-ingress', name]) {
    let labels;
    try { labels = JSON.parse(docker('inspect', '--format', '{{json .Config.Labels}}', target)); } catch { continue; }
    if (labels?.['sams.book-rag.sprint'] !== '10d3') throw new Error('Container ownership mismatch');
    docker('stop', '--timeout', '15', target);
  }
}

export function attachPostgres(network, container = 'sams-postgres') {
  const info = JSON.parse(docker('inspect', '--format', '{{json .NetworkSettings.Networks}}', container));
  if (!info[network]) docker('network', 'connect', '--alias', 'postgres', network, container);
  else if (!info[network].Aliases?.includes('postgres')) throw new Error('Database alias mismatch');
}

export function startContainer({ password, key, models, network = 'sams_book_rag_internal_10d3',
  store = 'sams_book_rag_store_10d3', name = 'sams-book-rag-10d3', port = 18000, database = 'sams_library', output = 'inherit' }) {
  if (typeof password !== 'string' || !password || typeof key !== 'string' || key.length < 32 || !models) {
    throw new Error('Required runtime credentials/configuration unavailable');
  }
  const map = resolve(repoRoot, 'data/demo/legacy-book-code-map.json');
  const instance = randomUUID();
  const raw = readFileSync(map), source = JSON.parse(raw).sourceSha256;
  const env = { BOOK_RAG_CONTAINER: '1', BOOK_RAG_SOURCE: 'postgres', BOOK_RAG_PGHOST: 'postgres',
    BOOK_RAG_PGPORT: '5432', BOOK_RAG_PGDATABASE: database, BOOK_RAG_PGUSER: 'sams_book_rag_ro',
    BOOK_RAG_MAP_PATH: '/catalog/legacy-book-code-map.json', BOOK_RAG_MAP_SHA256: createHash('sha256').update(raw).digest('hex'),
    BOOK_RAG_SOURCE_SHA256: source, BOOK_RAG_REFRESH_SECONDS: '5', BOOK_RAG_MAX_STALE_SECONDS: '30',
    SAMS_MODELS_DIR: '/models', SAMS_STORE_DIR: '/store', LLM_PROVIDER: 'extractive', API_ALLOWED_ORIGINS: '', API_UNLIMITED_ROLES: '' };
  const args = ['run', '--rm', '--interactive', '--name', name, '--label', owner, '--label', `sams.book-rag.instance=${instance}`, '--network', network,
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:size=128m,mode=1777',
    '--mount', `type=bind,source=${resolve(models)},target=/models,readonly`,
    '--mount', `type=bind,source=${map},target=/catalog/legacy-book-code-map.json,readonly`,
    '--mount', `type=volume,source=${store},target=/store`];
  for (const [field, value] of Object.entries(env)) args.push('--env', `${field}=${value}`);
  const child = spawn('docker', [...args, 'sams-book-rag:10d3'], { windowsHide: true, stdio: ['pipe', output, output] });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify({ BOOK_RAG_PGPASSWORD: password, API_SERVICE_KEY: key }) + '\n');
  const subnet = JSON.parse(docker('network', 'inspect', network))[0].IPAM.Config[0].Subnet;
  child.ingress = spawn('docker', ['run', '--rm', '--name', name+'-ingress', '--label', owner, '--label', `sams.book-rag.instance=${instance}`,
    '--network', network, '--network', 'sams_book_rag_ingress_10d3', '--publish', `127.0.0.1:${port}:8000`,
    '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--tmpfs', '/tmp:size=16m,mode=1777',
    '--memory', '96m', '--pids-limit', '32', '--env', `BOOK_RAG_TARGET=${name}`, '--env', `BOOK_RAG_INTERNAL_SUBNET=${subnet}`,
    '--entrypoint', 'python', 'sams-book-rag:10d3', '-m', 'app.tcp_ingress'],
    { windowsHide: true, stdio: ['ignore', output, output] });
  child.once('exit', () => {
    try {
      const labels = JSON.parse(docker('inspect', '--format', '{{json .Config.Labels}}', name+'-ingress'));
      if (labels?.['sams.book-rag.instance'] === instance) docker('stop', '--timeout', '5', name+'-ingress');
    } catch {}
  });
  return child;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    let line = '';
    for await (const chunk of process.stdin) { line += chunk; if (line.length > 8192) throw new Error(); }
    const secret = JSON.parse(line); line = '';
    prepareResources(); attachPostgres('sams_book_rag_internal_10d3');
    const child = startContainer({ password: secret.BOOK_RAG_PGPASSWORD, key: secret.API_SERVICE_KEY,
      models: process.env.BOOK_RAG_MODELS_HOST_PATH });
    const stop = () => { try { stopContainer('sams-book-rag-10d3'); } catch {} };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
    child.on('exit', (code) => { process.exitCode = code || 0; });
  } catch { console.error('Book RAG local launch failed; check non-secret configuration.'); process.exitCode = 1; }
}
