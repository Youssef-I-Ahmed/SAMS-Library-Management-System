import { loadEnvFile } from 'node:process';
import http from 'node:http';
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
  process.env.SAMS_API_URL ??
  'http://localhost:4000';

const allowedOrigin =
  process.env.WEB_ORIGIN ??
  'http://localhost:5173';

async function readJsonSafe(
  response
) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function sendRawHttpRequest({
  method,
  url,
  headers = {}
}) {
  return new Promise(
    (
      resolve,
      reject
    ) => {
      const target =
        new URL(url);

      const request =
        http.request(
          {
            protocol:
              target.protocol,
            hostname:
              target.hostname,
            port:
              target.port,
            path:
              `${target.pathname}${target.search}`,
            method,
            headers
          },
          (response) => {
            let body = '';

            response.setEncoding(
              'utf8'
            );

            response.on(
              'data',
              (chunk) => {
                body += chunk;
              }
            );

            response.on(
              'end',
              () => {
                resolve({
                  status:
                    response.statusCode,
                  headers:
                    response.headers,
                  body
                });
              }
            );
          }
        );

      request.on(
        'error',
        reject
      );

      request.end();
    }
  );
}

async function main() {
  console.log(
    '1) Security headers + request ID...'
  );

  const root =
    await fetch(
      `${baseUrl}/`,
      {
        headers: {
          'x-request-id':
            's8a-client-request-001'
        }
      }
    );

  if (
    root.status !== 200
  ) {
    throw new Error(
      `Root request expected 200, got ${root.status}`
    );
  }

  if (
    root.headers.get(
      'x-request-id'
    ) !==
    's8a-client-request-001'
  ) {
    throw new Error(
      'Safe client request ID was not echoed.'
    );
  }

  if (
    root.headers.has(
      'x-powered-by'
    )
  ) {
    throw new Error(
      'X-Powered-By should be removed by Helmet.'
    );
  }

  if (
    root.headers.get(
      'x-content-type-options'
    ) !==
    'nosniff'
  ) {
    throw new Error(
      'Helmet nosniff header missing.'
    );
  }

  console.log(
    'Security headers + request ID: OK'
  );

  console.log(
    '2) Unsafe request ID must be replaced...'
  );

  const badId =
    await fetch(
      `${baseUrl}/`,
      {
        headers: {
          'x-request-id':
            'bad request id\n'
        }
      }
    );

  const returnedId =
    badId.headers.get(
      'x-request-id'
    );

  if (
    !returnedId ||
    returnedId ===
      'bad request id\n'
  ) {
    throw new Error(
      'Unsafe request ID was not replaced.'
    );
  }

  console.log(
    'Request ID sanitization: OK'
  );

  console.log(
    '3) Allowed browser origin + preflight...'
  );

  const preflight =
    await fetch(
      `${baseUrl}/api/v1/auth/me`,
      {
        method:
          'OPTIONS',
        headers: {
          Origin:
            allowedOrigin,
          'Access-Control-Request-Method':
            'GET',
          'Access-Control-Request-Headers':
            'Authorization'
        }
      }
    );

  if (
    preflight.status !==
    204
  ) {
    throw new Error(
      `Expected CORS preflight 204, got ${preflight.status}`
    );
  }

  if (
    preflight.headers.get(
      'access-control-allow-origin'
    ) !==
    allowedOrigin
  ) {
    throw new Error(
      'Allowed CORS origin was not returned.'
    );
  }

  console.log(
    'Allowed CORS preflight: OK'
  );

  console.log(
    '4) Unknown browser origin must be rejected...'
  );

  const denied =
    await fetch(
      `${baseUrl}/`,
      {
        headers: {
          Origin:
            'https://evil.example'
        }
      }
    );

  const deniedBody =
    await readJsonSafe(
      denied
    );

  if (
    denied.status !==
      403 ||
    deniedBody?.error?.code !==
      'CORS_ORIGIN_DENIED'
  ) {
    throw new Error(
      `Expected CORS denial 403/CORS_ORIGIN_DENIED, got ${denied.status} ${JSON.stringify(deniedBody)}`
    );
  }

  if (
    !deniedBody
      ?.error
      ?.requestId
  ) {
    throw new Error(
      'CORS denial response is missing requestId.'
    );
  }

  console.log(
    'CORS denial: OK'
  );

  console.log(
    '5) Invalid JSON must be a safe 400...'
  );

  const invalidJson =
    await fetch(
      `${baseUrl}/api/v1/auth/dev-login`,
      {
        method:
          'POST',
        headers: {
          'content-type':
            'application/json'
        },
        body:
          '{"universityEmail":'
      }
    );

  const invalidBody =
    await readJsonSafe(
      invalidJson
    );

  if (
    invalidJson.status !==
      400 ||
    invalidBody?.error?.code !==
      'INVALID_JSON'
  ) {
    throw new Error(
      `Expected 400 INVALID_JSON, got ${invalidJson.status} ${JSON.stringify(invalidBody)}`
    );
  }

  if (
    !invalidBody
      ?.error
      ?.requestId
  ) {
    throw new Error(
      'Invalid JSON response is missing requestId.'
    );
  }

  console.log(
    'Invalid JSON handling: OK'
  );

  console.log(
    '6) Oversized JSON must be 413...'
  );

  const oversizedPayload =
    JSON.stringify({
      payload:
        'x'.repeat(
          2 *
            1024 *
            1024 +
          32 *
            1024
        )
    });

  const oversized =
    await fetch(
      `${baseUrl}/api/v1/auth/dev-login`,
      {
        method:
          'POST',
        headers: {
          'content-type':
            'application/json'
        },
        body:
          oversizedPayload
      }
    );

  const oversizedBody =
    await readJsonSafe(
      oversized
    );

  if (
    oversized.status !==
      413 ||
    oversizedBody?.error?.code !==
      'PAYLOAD_TOO_LARGE'
  ) {
    throw new Error(
      `Expected 413 PAYLOAD_TOO_LARGE, got ${oversized.status} ${JSON.stringify(oversizedBody)}`
    );
  }

  console.log(
    'Payload-size protection: OK'
  );

  console.log(
    '7) TRACE must be rejected...'
  );

  // Node's fetch()/Undici intentionally refuses TRACE before
  // sending the request. Use the lower-level HTTP client so
  // this smoke actually exercises the Express middleware.
  const trace =
    await sendRawHttpRequest({
      method:
        'TRACE',
      url:
        `${baseUrl}/`
    });

  let traceBody = null;

  try {
    traceBody =
      JSON.parse(
        trace.body
      );
  } catch {
    traceBody = null;
  }

  if (
    trace.status !==
      405 ||
    traceBody?.error?.code !==
      'METHOD_NOT_ALLOWED'
  ) {
    throw new Error(
      `Expected TRACE 405/METHOD_NOT_ALLOWED, got ${trace.status} ${JSON.stringify(traceBody)}`
    );
  }

  if (
    !traceBody
      ?.error
      ?.requestId
  ) {
    throw new Error(
      'TRACE rejection response is missing requestId.'
    );
  }

  console.log(
    'TRACE rejection: OK'
  );

  console.log('');
  console.log(
    'Sprint 8A HTTP hardening smoke PASSED.'
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
