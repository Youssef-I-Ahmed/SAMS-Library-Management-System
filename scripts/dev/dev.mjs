// Starts the whole system locally in one terminal: AI services, API and web.
// Usage: npm run dev [-- --only web,api,subject-classifier]
// A Python service starts when its URL is set in .env and its .venv exists (npm run setup).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { isWindows, pythonServices, readEnv, root, venvPython } from './services.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]?.split(',') : null;
const wanted = (name) => !only || only.includes(name);
const env = readEnv();
if (!Object.keys(env).length) {
  console.error('No .env found. Run `npm run setup` first.');
  process.exit(1);
}

const colors = [36, 35, 33, 32, 34, 31];
const children = [];
let stopping = false;

function start(name, command, commandArgs, options) {
  const color = colors[children.length % colors.length];
  const prefix = `\x1b[${color}m${name.padEnd(18)}\x1b[0m|`;
  const child = spawn(command, commandArgs, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  const print = (stream, out) => {
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) out.write(`${prefix} ${line}\n`);
    });
  };
  print(child.stdout, process.stdout);
  print(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) console.log(`${prefix} stopped (exit ${code}). The other parts keep running.`);
  });
  children.push(child);
}

for (const service of pythonServices) {
  if (!wanted(service.name)) continue;
  const url = env[service.urlVar];
  if (!url) { console.log(`- ${service.name}: skipped (${service.urlVar} is empty in .env)`); continue; }
  if (!existsSync(venvPython(service))) {
    console.log(`- ${service.name}: skipped (no .venv, run \`npm run setup -- --only ${service.name}\`)`);
    continue;
  }
  const port = String(new URL(url).port || service.port);
  start(service.name, venvPython(service), ['-m', 'uvicorn', service.app, '--host', '127.0.0.1', '--port', port],
    { cwd: join(root, service.dir), env: { ...process.env, ...service.env(env), PYTHONUNBUFFERED: '1' } });
}

const npm = isWindows ? 'npm.cmd' : 'npm';
if (wanted('api')) start('api', npm, ['run', 'dev', '-w', '@sams/api'], { cwd: root, shell: isWindows });
if (wanted('web')) start('web', npm, ['run', 'dev', '-w', '@sams/web'], { cwd: root, shell: isWindows,
  env: { ...process.env, VITE_AI_ASSISTANT_ENABLED: String(env.AI_ENABLED === 'true') } });

console.log('\nWeb: http://localhost:5173 | API: http://localhost:4000 | Ctrl+C stops everything.\n');

function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    if (isWindows) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
