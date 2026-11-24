import path from 'node:path';
import {
  spawnSync
} from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

const projectRoot =
  path.resolve(
    __dirname,
    '../..'
  );

const importCode =
  "await import('./apps/api/src/config/env.js');";

function runCase(
  overrides
) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      importCode
    ],
    {
      cwd:
        projectRoot,
      env: {
        ...process.env,
        DATABASE_URL:
          process.env
            .DATABASE_URL ??
          'postgresql://placeholder:placeholder@localhost:5432/placeholder',
        ...overrides
      },
      encoding:
        'utf8'
    }
  );
}

function expectFailure(
  label,
  overrides
) {
  const result =
    runCase(
      overrides
    );

  if (
    result.status === 0
  ) {
    throw new Error(
      `${label}: expected production env validation failure`
    );
  }

  console.log(
    `${label}: blocked as expected`
  );
}

function expectSuccess(
  label,
  overrides
) {
  const result =
    runCase(
      overrides
    );

  if (
    result.status !== 0
  ) {
    throw new Error(
      `${label}: expected success, got ${result.stderr || result.stdout}`
    );
  }

  console.log(
    `${label}: OK`
  );
}

expectFailure(
  'Production DEV_AUTH_ENABLED=true',
  {
    NODE_ENV:
      'production',
    DEV_AUTH_ENABLED:
      'true',
    WEB_ORIGIN:
      'https://library.example.edu',
    AUTH_TOKEN_SECRET:
      'x'.repeat(64)
  }
);

expectFailure(
  'Production short auth secret',
  {
    NODE_ENV:
      'production',
    DEV_AUTH_ENABLED:
      'false',
    WEB_ORIGIN:
      'https://library.example.edu',
    AUTH_TOKEN_SECRET:
      'x'.repeat(32)
  }
);

expectFailure(
  'Production insecure WEB_ORIGIN',
  {
    NODE_ENV:
      'production',
    DEV_AUTH_ENABLED:
      'false',
    WEB_ORIGIN:
      'http://library.example.edu',
    AUTH_TOKEN_SECRET:
      'x'.repeat(64)
  }
);

expectSuccess(
  'Production-safe environment',
  {
    NODE_ENV:
      'production',
    DEV_AUTH_ENABLED:
      'false',
    WEB_ORIGIN:
      'https://library.example.edu',
    AUTH_TOKEN_SECRET:
      'x'.repeat(64),
    API_JSON_LIMIT:
      '2mb',
    REQUEST_LOGGING:
      'true'
  }
);

console.log('');
console.log(
  'Sprint 8A production environment guards PASSED.'
);
