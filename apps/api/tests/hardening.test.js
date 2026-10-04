import request from 'supertest';
import {
  describe,
  expect,
  it
} from 'vitest';
import { app } from '../src/app.js';

describe(
  'SAMS API hardening',
  () => {
    it(
      'exposes a DB-independent liveness endpoint',
      async () => {
        const response =
          await request(app)
            .get(
              '/api/v1/health/live'
            )
            .expect(200);

        expect(
          response.body.status
        ).toBe('ok');

        expect(
          response.body.check
        ).toBe(
          'liveness'
        );

        expect(
          response.body.requestId
        ).toBeTruthy();

        expect(
          response.headers[
            'x-request-id'
          ]
        ).toBeTruthy();
      }
    );

    it(
      'preserves a safe request ID',
      async () => {
        const response =
          await request(app)
            .get('/')
            .set(
              'X-Request-Id',
              'vitest-request-001'
            )
            .expect(200);

        expect(
          response.headers[
            'x-request-id'
          ]
        ).toBe(
          'vitest-request-001'
        );
      }
    );

    it(
      'returns structured 404 errors with request ID',
      async () => {
        const response =
          await request(app)
            .get(
              '/definitely-not-a-route'
            )
            .expect(404);

        expect(
          response.body.error.code
        ).toBe(
          'NOT_FOUND'
        );

        expect(
          response.body.error.requestId
        ).toBeTruthy();
      }
    );
  }
);
