import {
  startHttpServer
} from './runtime/http-server.js';

const runtime =
  await startHttpServer();

let shuttingDown =
  false;

async function handleShutdown(
  signal
) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(
    JSON.stringify({
      level: 'info',
      event:
        'server_shutdown_started',
      signal
    })
  );

  try {
    await runtime.shutdown(
      signal
    );

    console.log(
      JSON.stringify({
        level: 'info',
        event:
          'server_shutdown_completed',
        signal
      })
    );

    process.exitCode = 0;
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event:
          'server_shutdown_failed',
        signal,
        message:
          error?.message ??
          'Unknown shutdown error'
      })
    );

    process.exitCode = 1;
  }
}

process.once(
  'SIGINT',
  () => {
    void handleShutdown(
      'SIGINT'
    );
  }
);

process.once(
  'SIGTERM',
  () => {
    void handleShutdown(
      'SIGTERM'
    );
  }
);
