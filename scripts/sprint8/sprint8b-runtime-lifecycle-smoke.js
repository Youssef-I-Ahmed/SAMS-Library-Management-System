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

const {
  startHttpServer
} =
  await import(
    '../../apps/api/src/runtime/http-server.js'
  );

async function main() {
  console.log(
    'Starting isolated ephemeral API runtime...'
  );

  const runtime =
    await startHttpServer({
      port: 0,
      host:
        '127.0.0.1',
      logStartup:
        false
    });

  const baseUrl =
    `http://127.0.0.1:${runtime.port}`;

  const live =
    await fetch(
      `${baseUrl}/api/v1/health/live`,
      {
        headers: {
          Connection:
            'close'
        }
      }
    );

  if (
    live.status !== 200
  ) {
    throw new Error(
      `Ephemeral liveness expected 200, got ${live.status}`
    );
  }

  const ready =
    await fetch(
      `${baseUrl}/api/v1/health/ready`,
      {
        headers: {
          Connection:
            'close'
        }
      }
    );

  const readyBody =
    await ready.json();

  if (
    ready.status !== 200 ||
    readyBody.database !==
      'connected'
  ) {
    throw new Error(
      `Ephemeral readiness failed: ${ready.status} ${JSON.stringify(readyBody)}`
    );
  }

  console.log(
    'Ephemeral liveness/readiness: OK'
  );

  await runtime.shutdown(
    'SPRINT8B_SMOKE'
  );

  if (
    runtime.server
      .listening
  ) {
    throw new Error(
      'HTTP server is still listening after graceful shutdown.'
    );
  }

  console.log(
    'Graceful shutdown completed and listener closed: OK'
  );
  console.log('');
  console.log(
    'Sprint 8B runtime lifecycle smoke PASSED.'
  );
}

main().catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
