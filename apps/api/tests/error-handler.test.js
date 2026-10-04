import {
  describe,
  expect,
  it
} from 'vitest';
import {
  normalizeError
} from '../src/middleware/error-handler.js';

describe(
  'global error normalization',
  () => {
    it(
      'maps Prisma P2002 uniqueness conflicts to HTTP 409',
      () => {
        const normalized =
          normalizeError({
            name:
              'PrismaClientKnownRequestError',
            code:
              'P2002',
            meta: {
              target: [
                'barcode'
              ]
            },
            message:
              'Unique constraint failed on the fields: (`barcode`)'
          });

        expect(
          normalized
        ).toEqual({
          statusCode: 409,
          code:
            'UNIQUE_CONSTRAINT_CONFLICT',
          message:
            'A record with the same unique value already exists'
        });
      }
    );

    it(
      'does not expose unknown 500 messages to clients through status normalization',
      () => {
        const normalized =
          normalizeError(
            new Error(
              'database secret detail'
            )
          );

        expect(
          normalized.statusCode
        ).toBe(500);

        expect(
          normalized.code
        ).toBe(
          'INTERNAL_SERVER_ERROR'
        );
      }
    );
  }
);
