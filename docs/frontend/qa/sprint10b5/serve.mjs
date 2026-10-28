// Isolated audit host: reads the existing production build; never proxies APIs.
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const dist = resolve(root, 'apps/web/dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8' };
export function createAuditServer() { return createServer(async (req, res) => {
  const url = new URL(req.url, 'http://audit.invalid');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-src 'self'; object-src 'none'; form-action 'self'");
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) { res.writeHead(405, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 'AUDIT_READ_ONLY', message: 'No API or mutation is available on this audit host.' } })); }
  try {
    if (url.pathname === '/__audit/fixtures.js') { res.setHeader('Content-Type', types['.js']); return res.end(await readFile(resolve(here, 'fixtures.js'))); }
    const isAudit = url.pathname.startsWith('/audit/');
    const base = isAudit ? here : dist;
    const pathname = decodeURIComponent(isAudit ? url.pathname.slice('/audit'.length) : url.pathname);
    let file = resolve(base, '.' + pathname);
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403); return res.end(); }
    let info; try { info = await stat(file); } catch {}
    if (info?.isDirectory()) file = resolve(file, 'index.html');
    if (!info && isAudit) { res.writeHead(404); return res.end('Audit artifact not found'); }
    if (!info && !isAudit) file = resolve(dist, 'index.html');
    let body = await readFile(file);
    if (file === resolve(dist, 'index.html')) body = Buffer.from(body.toString().replace('<head>', '<head><script src="/__audit/fixtures.js"></script>'));
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch (error) { res.writeHead(500); res.end('Audit host: ' + error.message); }
}); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const server = createAuditServer();
server.listen(Number(process.env.SAMS_AUDIT_PORT || 0), '127.0.0.1', async () => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  await writeFile(resolve(here, 'runtime.json'), JSON.stringify({ origin, pid: process.pid, dist, fixtures: true, mutations: false }, null, 2));
  console.log(`SAMS read-only audit host: ${origin}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
