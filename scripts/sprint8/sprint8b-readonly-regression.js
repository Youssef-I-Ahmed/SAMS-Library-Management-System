import { loadEnvFile } from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename =
  fileURLToPath(
    import.meta.url
  );

const __dirname =
  path.dirname(
    __filename
  );

loadEnvFile(
  path.resolve(
    __dirname,
    '../../.env'
  )
);

const baseUrl =
  process.env
    .SAMS_API_URL ??
  'http://localhost:4000';

async function jsonRequest(
  pathname,
  {
    method = 'GET',
    token,
    body
  } = {}
) {
  const response =
    await fetch(
      `${baseUrl}${pathname}`,
      {
        method,
        headers: {
          ...(token
            ? {
                Authorization:
                  `Bearer ${token}`
              }
            : {}),
          ...(body
            ? {
                'Content-Type':
                  'application/json'
              }
            : {})
        },
        body:
          body
            ? JSON.stringify(
                body
              )
            : undefined
      }
    );

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

async function login(
  universityEmail
) {
  const result =
    await jsonRequest(
      '/api/v1/auth/dev-login',
      {
        method: 'POST',
        body: {
          universityEmail
        }
      }
    );

  if (
    result.status !== 200 ||
    !result.payload
      ?.accessToken
  ) {
    throw new Error(
      `Dev login failed for ${universityEmail}: ${result.status}`
    );
  }

  return result
    .payload
    .accessToken;
}

function expectStatus(
  label,
  result,
  expected
) {
  if (
    result.status !==
    expected
  ) {
    throw new Error(
      `${label}: expected ${expected}, got ${result.status} ${JSON.stringify(result.payload)}`
    );
  }

  if (
    !result.requestId
  ) {
    throw new Error(
      `${label}: missing X-Request-Id`
    );
  }

  console.log(
    `${label}: OK`
  );
}

async function main() {
  console.log(
    '1) Liveness + readiness...'
  );

  const live =
    await jsonRequest(
      '/api/v1/health/live'
    );

  expectStatus(
    'Liveness',
    live,
    200
  );

  if (
    live.payload
      ?.check !==
    'liveness'
  ) {
    throw new Error(
      'Liveness payload contract mismatch.'
    );
  }

  const ready =
    await jsonRequest(
      '/api/v1/health/ready'
    );

  expectStatus(
    'Readiness',
    ready,
    200
  );

  if (
    ready.payload
      ?.database !==
    'connected'
  ) {
    throw new Error(
      'Readiness did not report connected database.'
    );
  }

  console.log(
    '2) Login persistent dev roles...'
  );

  const [
    studentToken,
    librarianToken,
    managementToken
  ] =
    await Promise.all([
      login(
        'student@sams.dev'
      ),
      login(
        'librarian@sams.dev'
      ),
      login(
        'management@sams.dev'
      )
    ]);

  console.log(
    'Persistent role login: OK'
  );

  console.log(
    '3) Read-only route regression...'
  );

  expectStatus(
    'Branches / librarian',
    await jsonRequest(
      '/api/v1/master-data/branches',
      {
        token:
          librarianToken
      }
    ),
    200
  );

  expectStatus(
    'Discovery / student',
    await jsonRequest(
      '/api/v1/discovery/items?pageSize=1',
      {
        token:
          studentToken
      }
    ),
    200
  );

  expectStatus(
    'Reservations me / student',
    await jsonRequest(
      '/api/v1/reservations/me?pageSize=1',
      {
        token:
          studentToken
      }
    ),
    200
  );

  expectStatus(
    'Borrowings me / student',
    await jsonRequest(
      '/api/v1/borrowings/me?pageSize=1',
      {
        token:
          studentToken
      }
    ),
    200
  );

  expectStatus(
    'Borrowing operations / management',
    await jsonRequest(
      '/api/v1/borrowings?pageSize=1',
      {
        token:
          managementToken
      }
    ),
    200
  );

  expectStatus(
    'Visits operations / management',
    await jsonRequest(
      '/api/v1/visits?pageSize=1',
      {
        token:
          managementToken
      }
    ),
    200
  );

  expectStatus(
    'Analytics overview / management',
    await jsonRequest(
      '/api/v1/analytics/overview',
      {
        token:
          managementToken
      }
    ),
    200
  );

  console.log(
    '4) Auth boundary regression...'
  );

  expectStatus(
    'Analytics denied / student',
    await jsonRequest(
      '/api/v1/analytics/overview',
      {
        token:
          studentToken
      }
    ),
    403
  );

  expectStatus(
    'Protected branches denied / anonymous',
    await jsonRequest(
      '/api/v1/master-data/branches'
    ),
    401
  );

  expectStatus(
    'Unknown route',
    await jsonRequest(
      '/api/v1/does-not-exist'
    ),
    404
  );

  console.log('');
  console.log(
    'Sprint 8B read-only API regression PASSED.'
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
