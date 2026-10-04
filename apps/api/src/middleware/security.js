import { env } from '../config/env.js';
import { AppError } from '../utils/app-error.js';

export const corsOptions = {
  origin(
    origin,
    callback
  ) {
    // Server-to-server calls, CLI smoke tests and same-origin
    // non-browser requests may not send an Origin header.
    if (!origin) {
      callback(
        null,
        true
      );
      return;
    }

    if (
      origin ===
      env.WEB_ORIGIN
    ) {
      callback(
        null,
        true
      );
      return;
    }

    callback(
      new AppError(
        403,
        'CORS_ORIGIN_DENIED',
        'Origin is not allowed'
      )
    );
  },

  credentials: true,

  methods: [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'Idempotency-Key',
    'X-Request-Id'
  ],

  exposedHeaders: [
    'X-Request-Id'
  ],

  maxAge: 600
};

export function rejectTrace(
  req,
  _res,
  next
) {
  if (
    req.method ===
    'TRACE'
  ) {
    next(
      new AppError(
        405,
        'METHOD_NOT_ALLOWED',
        'HTTP TRACE is not allowed'
      )
    );
    return;
  }

  next();
}
