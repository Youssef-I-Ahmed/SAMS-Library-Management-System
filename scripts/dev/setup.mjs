// One-time local setup: .env, PostgreSQL, Prisma, and a virtualenv per Python service.
// Usage: npm run setup [-- --skip-db] [-- --only research-rag,subject-classifier]
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isWindows, pythonServices, readEnv, root, venvPython } from './services.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1]?.split(',') : null;
const skipDb = args.includes('--skip-db');
const python = process.env.PYTHON || (isWindows ? 'py' : 'python3');

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: root, shell: isWindows, ...options });
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status ?? result.signal})`);
}

// 1. .env with generated local secrets for every empty secret.
const envPath = join(root, '.env');
if (!existsSync(envPath)) {
  copyFileSync(join(root, '.env.example'), envPath);
  console.log('Created .env from .env.example');
}
const secret = () => randomBytes(32).toString('hex');
const generated = {
  AUTH_TOKEN_SECRET: (v) => !v || v.startsWith('replace-this'),
  RAG_SERVICE_KEY: (v) => !v,
  RESEARCH_RAG_JWT_SECRET: (v) => !v,
  SUBJECT_CLASSIFIER_KEY: (v) => !v,
  BOOK_CLUSTERING_KEY: (v) => !v
};
let text = readFileSync(envPath, 'utf8');
// Add settings that newer versions of .env.example introduced, keeping existing values.
const example = readEnv(join(root, '.env.example'));
const missing = Object.keys(example).filter((name) => !(name in readEnv(envPath)));
if (missing.length) {
  text = `${text.trimEnd()}\n\n# Added by npm run setup\n${missing.map((name) => `${name}=${example[name]}`).join('\n')}\n`;
  console.log(`Added to .env: ${missing.join(', ')}`);
}
const current = { ...example, ...readEnv(envPath) };
for (const [name, empty] of Object.entries(generated)) {
  if (!empty(current[name] ?? '')) continue;
  const line = `${name}="${secret()}"`;
  text = new RegExp(`^${name}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${name}=.*$`, 'm'), line) : `${text}\n${line}\n`;
  console.log(`Generated ${name}`);
}
writeFileSync(envPath, text);

// 2. Node dependencies, PostgreSQL and the schema.
run('npm', ['install']);
run('npm', ['run', 'db:generate']);   // writes the Prisma client into node_modules only
if (!skipDb) {
  run('docker', ['compose', 'up', '-d']);
  run('npx', ['-w', '@sams/api', 'dotenv', '-e', '../../.env', '--', 'prisma', 'migrate', 'deploy',
    '--schema=../../database/prisma/schema.prisma']);
}

// 3. One virtualenv per Python service (they pin different library versions).
const failed = [];
for (const service of pythonServices) {
  if (only && !only.includes(service.name)) continue;
  const dir = join(root, service.dir);
  try {
    if (!existsSync(venvPython(service))) {
      run(python, [...(python === 'py' ? ['-3'] : []), '-m', 'venv', '.venv'], { cwd: dir });
    }
    run(venvPython(service), ['-m', 'pip', 'install', '--upgrade', 'pip'], { cwd: dir, shell: false });
    for (const file of service.requirements) {
      run(venvPython(service), ['-m', 'pip', 'install', '-r', file], { cwd: dir, shell: false });
    }
  } catch (error) {
    failed.push(service.name);
    console.error(`! ${service.name}: ${error.message}`);
  }
}

console.log('\nSetup finished.');
if (failed.length) console.log(`Python setup failed for: ${failed.join(', ')} (the rest of the system still runs).`);
console.log('Next: set the AI service URLs you want in .env, then run `npm run dev`.');
