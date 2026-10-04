function requestIdOf(
  req
) {
  return (
    req?.requestId ??
    null
  );
}

function normalizePrismaError(
  err
) {
  if (
    err?.code ===
    'P2002'
  ) {
    return {
      statusCode: 409,
      code:
        'UNIQUE_CONSTRAINT_CONFLICT',
      message:
        'A record with the same unique value already exists'
    };
  }

  return null;
}

export function normalizeError(
  err
) {
  if (
    err?.type ===
    'entity.too.large'
  ) {
    return {
      statusCode: 413,
      code:
        'PAYLOAD_TOO_LARGE',
      message:
        'Request payload is too large'
    };
  }

  if (
    err?.type ===
      'entity.parse.failed' ||
    (
      err instanceof
        SyntaxError &&
      err?.status === 400
    )
  ) {
    return {
      statusCode: 400,
      code:
        'INVALID_JSON',
      message:
        'Request body contains invalid JSON'
    };
  }

  const prismaError =
    normalizePrismaError(
      err
    );

  if (prismaError) {
    return prismaError;
  }

  const statusCode =
    Number(
      err?.statusCode ??
      err?.status ??
      500
    );

  return {
    statusCode:
      Number.isInteger(
        statusCode
      ) &&
      statusCode >= 400 &&
      statusCode <= 599
        ? statusCode
        : 500,

    code:
      typeof err?.code ===
        'string'
        ? err.code
        : 'INTERNAL_SERVER_ERROR',

    message:
      err?.message ??
      'Unexpected server error'
  };
}

export function notFound(
  req,
  res
) {
  res
    .status(404)
    .json({
      error: {
        code:
          'NOT_FOUND',
        message:
          `Route not found: ${req.method} ${req.originalUrl}`,
        requestId:
          requestIdOf(req)
      }
    });
}

export function errorHandler(
  err,
  req,
  res,
  _next
) {
  const normalized =
    normalizeError(err);

  if (
    normalized.statusCode >=
    500
  ) {
    console.error(
      JSON.stringify({
        level: 'error',
        event:
          'request_error',
        requestId:
          requestIdOf(req),
        method:
          req.method,
        path:
          req.path,
        code:
          normalized.code,
        message:
          err?.message ??
          'Unknown error',
        stack:
          err?.stack ??
          null
      })
    );
  }

  res
    .status(
      normalized.statusCode
    )
    .json({
      error: {
        code:
          normalized.code,

        message:
          normalized.statusCode >=
          500
            ? 'Unexpected server error'
            : normalized.message,

        requestId:
          requestIdOf(req)
      }
    });
}
