import { Prisma } from '@prisma/client';

export function notFound(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`
    }
  });
}

export function errorHandler(err, _req, res, _next) {
  let statusCode = err.statusCode ?? 500;
  let code = err.code ?? 'INTERNAL_SERVER_ERROR';
  let message = err.message;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      code = 'DUPLICATE_VALUE';
      message = 'A record with the same unique value already exists';
    } else if (err.code === 'P2003') {
      statusCode = 409;
      code = 'REFERENCE_CONFLICT';
      message = 'The operation conflicts with related records';
    } else if (err.code === 'P2025') {
      statusCode = 404;
      code = 'NOT_FOUND';
      message = 'Record not found';
    }
  }

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      code,
      message:
        statusCode >= 500
          ? 'Unexpected server error'
          : message
    }
  });
}
