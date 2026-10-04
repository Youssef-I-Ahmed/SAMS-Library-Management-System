import { env } from '../config/env.js';

export function requestLogger(
  req,
  res,
  next
) {
  if (
    !env.REQUEST_LOGGING ||
    env.NODE_ENV === 'test'
  ) {
    next();
    return;
  }

  const startedAt =
    process.hrtime.bigint();

  res.on(
    'finish',
    () => {
      const durationNs =
        process.hrtime.bigint() -
        startedAt;

      const durationMs =
        Number(
          durationNs
        ) /
        1_000_000;

      console.log(
        JSON.stringify({
          level: 'info',
          event:
            'http_request',
          requestId:
            req.requestId ??
            null,
          method:
            req.method,
          path:
            req.path,
          status:
            res.statusCode,
          durationMs:
            Number(
              durationMs
                .toFixed(2)
            )
        })
      );
    }
  );

  next();
}
