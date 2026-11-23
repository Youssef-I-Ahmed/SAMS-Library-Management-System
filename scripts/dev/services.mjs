// Shared description of every runnable part, used by setup.mjs and dev.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');
export const isWindows = process.platform === 'win32';

/** Python services: folder, uvicorn target, port and the env each one receives from the root .env. */
export const pythonServices = [
  {
    name: 'book-rag', dir: 'services/book-rag', app: 'app.main:app', port: 8001,
    requirements: ['requirements-source.txt'], urlVar: 'RAG_URL',
    env: (e) => ({ API_SERVICE_KEY: e.RAG_SERVICE_KEY })
  },
  {
    name: 'research-rag', dir: 'services/research-rag', app: 'api.main:app', port: 8002,
    requirements: ['requirements.txt'], urlVar: 'RESEARCH_RAG_URL',
    env: (e) => ({ SERVICE_JWT_SECRET: e.RESEARCH_RAG_JWT_SECRET, SERVICE_JWT_ISSUER: 'sadat-express',
      SERVICE_JWT_AUDIENCE: 'sadat-rag' })
  },
  {
    name: 'subject-classifier', dir: 'services/subject-classifier', app: 'server:app', port: 8003,
    requirements: ['requirements.txt'], urlVar: 'SUBJECT_CLASSIFIER_URL',
    env: (e) => ({ SERVICE_API_KEY: e.SUBJECT_CLASSIFIER_KEY })
  },
  {
    name: 'book-clustering', dir: 'services/book-clustering', app: 'api:app', port: 8004,
    requirements: ['requirements.txt'], urlVar: 'BOOK_CLUSTERING_URL',
    env: (e) => ({ SERVICE_API_KEY: e.BOOK_CLUSTERING_KEY })
  }
];

export const venvPython = (service) =>
  join(root, service.dir, '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');

/** Minimal .env reader (KEY=value, optional quotes, # comments). */
export function readEnv(path = join(root, '.env')) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    env[match[1]] = value;
  }
  return env;
}
