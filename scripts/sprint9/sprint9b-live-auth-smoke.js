import {
  loadEnvFile
} from 'node:process';

import path from 'node:path';
import {
  fileURLToPath
} from 'node:url';

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

try {
  loadEnvFile(
    path.join(
      projectRoot,
      '.env'
    )
  );
} catch {
  // Fall back to defaults if .env is unavailable.
}

const apiPort =
  process.env.API_PORT ||
  '4000';

const apiBase =
  `http://localhost:${apiPort}/api/v1`;

const accounts = [
  {
    email:
      'student@sams.dev',
    role:
      'STUDENT'
  },
  {
    email:
      'librarian@sams.dev',
    role:
      'LIBRARIAN'
  },
  {
    email:
      'management@sams.dev',
    role:
      'MANAGEMENT'
  }
];

async function jsonRequest(
  pathname,
  {
    method = 'GET',
    token,
    body
  } = {}
) {
  let response;

  try {
    response =
      await fetch(
        `${apiBase}${pathname}`,
        {
          method,
          headers: {
            Accept:
              'application/json',
            ...(body !== undefined
              ? {
                  'Content-Type':
                    'application/json'
                }
              : {}),
            ...(token
              ? {
                  Authorization:
                    `Bearer ${token}`
                }
              : {})
          },
          body:
            body !== undefined
              ? JSON.stringify(
                  body
                )
              : undefined
        }
      );
  } catch (error) {
    throw new Error(
      `Network failure on ${method} ${pathname}: ${error?.cause?.code || error?.message || error}`
    );
  }

  let payload = null;

  try {
    payload =
      await response.json();
  } catch {
    payload = null;
  }

  return {
    status:
      response.status,
    payload,
    requestId:
      response.headers.get(
        'x-request-id'
      )
  };
}

function requireStatus(
  label,
  result,
  expected
) {
  if (
    result.status !==
    expected
  ) {
    throw new Error(
      `${label}: expected HTTP ${expected}, got ${result.status}. Payload: ${JSON.stringify(result.payload)}`
    );
  }
}

async function main() {
  console.log(
    `API: ${apiBase}`
  );
  console.log('');

  console.log(
    '1) API readiness...'
  );

  const ready =
    await jsonRequest(
      '/health/ready'
    );

  requireStatus(
    'Readiness',
    ready,
    200
  );

  if (
    ready.payload?.status !==
      'ready' ||
    ready.payload?.database !==
      'connected'
  ) {
    throw new Error(
      `Readiness payload mismatch: ${JSON.stringify(ready.payload)}`
    );
  }

  console.log(
    'API readiness: OK'
  );
  console.log('');

  console.log(
    '2) Development-auth accounts...'
  );

  for (
    const account of
    accounts
  ) {
    console.log(
      `Testing ${account.role} (${account.email})...`
    );

    const login =
      await jsonRequest(
        '/auth/dev-login',
        {
          method:
            'POST',
          body: {
            universityEmail:
              account.email
          }
        }
      );

    requireStatus(
      `${account.role} login`,
      login,
      200
    );

    if (
      !login.payload
        ?.accessToken
    ) {
      throw new Error(
        `${account.role} login did not return accessToken.`
      );
    }

    if (
      !login.payload
        ?.user?.roles
        ?.includes(
          account.role
        )
    ) {
      throw new Error(
        `${account.role} login role mismatch: ${JSON.stringify(login.payload?.user)}`
      );
    }

    const me =
      await jsonRequest(
        '/auth/me',
        {
          token:
            login.payload
              .accessToken
        }
      );

    requireStatus(
      `${account.role} /auth/me`,
      me,
      200
    );

    if (
      !me.payload
        ?.user?.roles
        ?.includes(
          account.role
        )
    ) {
      throw new Error(
        `${account.role} /auth/me role mismatch: ${JSON.stringify(me.payload?.user)}`
      );
    }

    console.log(
      `${account.role} auth contract: OK`
    );
  }

  console.log('');
  console.log(
    'Sprint 9B live authentication smoke PASSED.'
  );
}

main().catch(
  (error) => {
    console.error('');
    console.error(
      'Sprint 9B live authentication smoke FAILED.'
    );
    console.error(
      error
    );
    console.error('');
    console.error(
      'Check the npm run dev:api terminal for the matching server-side error/request log.'
    );

    process.exitCode = 1;
  }
);
