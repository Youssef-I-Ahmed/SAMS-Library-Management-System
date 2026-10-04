import { Router } from 'express';
import { prisma } from '../config/prisma.js';

export const healthRouter =
  Router();

function timestamp() {
  return new Date()
    .toISOString();
}

healthRouter.get(
  '/live',
  (
    req,
    res
  ) => {
    res.json({
      status:
        'ok',
      service:
        'sams-api',
      check:
        'liveness',
      uptimeSeconds:
        Math.floor(
          process.uptime()
        ),
      requestId:
        req.requestId ??
        null,
      timestamp:
        timestamp()
    });
  }
);

healthRouter.get(
  '/ready',
  async (
    req,
    res
  ) => {
    try {
      await prisma
        .$queryRaw`
          SELECT 1
        `;

      res.json({
        status:
          'ready',
        service:
          'sams-api',
        check:
          'readiness',
        database:
          'connected',
        requestId:
          req.requestId ??
          null,
        timestamp:
          timestamp()
      });
    } catch {
      res
        .status(503)
        .json({
          status:
            'not_ready',
          service:
            'sams-api',
          check:
            'readiness',
          database:
            'disconnected',
          requestId:
            req.requestId ??
            null,
          timestamp:
            timestamp()
        });
    }
  }
);

// Backward-compatible combined health endpoint used by
// earlier Sprint smoke/regression scripts.
healthRouter.get(
  '/',
  async (
    req,
    res
  ) => {
    try {
      await prisma
        .$queryRaw`
          SELECT 1
        `;

      res.json({
        status:
          'ok',
        service:
          'sams-api',
        database:
          'connected',
        requestId:
          req.requestId ??
          null,
        timestamp:
          timestamp()
      });
    } catch {
      res
        .status(503)
        .json({
          status:
            'not_ready',
          service:
            'sams-api',
          database:
            'disconnected',
          requestId:
            req.requestId ??
            null,
          timestamp:
            timestamp()
        });
    }
  }
);
