import { app } from '../app.js';
import { env } from '../config/env.js';
import { prisma } from '../config/prisma.js';

export async function startHttpServer({
  port = env.API_PORT,
  host,
  logStartup = true,
  disconnectPrismaOnShutdown = true
} = {}) {
  const server =
    await new Promise(
      (
        resolve,
        reject
      ) => {
        const instance =
          app.listen(
            port,
            host,
            () => {
              instance.off(
                'error',
                reject
              );

              resolve(
                instance
              );
            }
          );

        instance.once(
          'error',
          reject
        );
      }
    );

  const address =
    server.address();

  const actualPort =
    typeof address ===
      'object' &&
    address
      ? address.port
      : port;

  if (logStartup) {
    console.log(
      `SAMS API running on http://localhost:${actualPort}`
    );
  }

  let shutdownPromise =
    null;

  async function disconnectPrisma() {
    if (
      disconnectPrismaOnShutdown
    ) {
      await prisma
        .$disconnect();
    }
  }

  function shutdown(
    reason =
      'shutdown'
  ) {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise =
      new Promise(
        (
          resolve,
          reject
        ) => {
          let settled =
            false;

          const finish =
            async (
              error = null
            ) => {
              if (settled) {
                return;
              }

              settled = true;

              clearTimeout(
                forceTimer
              );

              try {
                await disconnectPrisma();
              } catch (
                disconnectError
              ) {
                reject(
                  disconnectError
                );
                return;
              }

              if (error) {
                reject(error);
                return;
              }

              resolve({
                reason,
                forced:
                  false
              });
            };

          const forceTimer =
            setTimeout(
              () => {
                if (
                  typeof server
                    .closeAllConnections ===
                  'function'
                ) {
                  server
                    .closeAllConnections();
                }
              },
              env
                .GRACEFUL_SHUTDOWN_TIMEOUT_MS
            );

          forceTimer.unref?.();

          server.close(
            (error) => {
              void finish(
                error
              );
            }
          );

          if (
            typeof server
              .closeIdleConnections ===
            'function'
          ) {
            server
              .closeIdleConnections();
          }
        }
      );

    return shutdownPromise;
  }

  return {
    server,
    port:
      actualPort,
    shutdown
  };
}
