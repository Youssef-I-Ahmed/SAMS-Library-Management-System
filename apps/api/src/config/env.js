import 'dotenv/config';
import { z } from 'zod';

const booleanString =
  z.enum([
    'true',
    'false'
  ])
  .transform(
    (value) =>
      value === 'true'
  );

const schema =
  z.object({
    NODE_ENV:
      z.enum([
        'development',
        'test',
        'production'
      ])
      .default(
        'development'
      ),

    API_PORT:
      z.coerce
        .number()
        .int()
        .positive()
        .max(65535)
        .default(4000),

    WEB_ORIGIN:
      z.string()
        .url()
        .default(
          'http://localhost:5173'
        ),

    DATABASE_URL:
      z.string()
        .min(1),

    AUTH_TOKEN_SECRET:
      z.string()
        .min(32),

    AUTH_TOKEN_EXPIRES_IN:
      z.string()
        .min(1)
        .default('8h'),

    DEV_AUTH_ENABLED:
      booleanString
        .default('true'),

    API_JSON_LIMIT:
      z.string()
        .regex(
          /^\d+(?:kb|mb)$/i,
          'API_JSON_LIMIT must look like 512kb or 2mb'
        )
        .transform(
          (value) =>
            value.toLowerCase()
        )
        .default('2mb'),

    REQUEST_LOGGING:
      booleanString
        .default('true'),

    GRACEFUL_SHUTDOWN_TIMEOUT_MS:
      z.coerce
        .number()
        .int()
        .min(1000)
        .max(60000)
        .default(10000)
  })
  .superRefine(
    (
      value,
      context
    ) => {
      if (
        value.NODE_ENV !==
        'production'
      ) {
        return;
      }

      if (
        value.DEV_AUTH_ENABLED
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          path: [
            'DEV_AUTH_ENABLED'
          ],
          message:
            'DEV_AUTH_ENABLED must be false in production'
        });
      }

      if (
        value.AUTH_TOKEN_SECRET
          .length < 48
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          path: [
            'AUTH_TOKEN_SECRET'
          ],
          message:
            'AUTH_TOKEN_SECRET must be at least 48 characters in production'
        });
      }

      const origin =
        new URL(
          value.WEB_ORIGIN
        );

      if (
        origin.protocol !==
        'https:'
      ) {
        context.addIssue({
          code:
            z.ZodIssueCode.custom,
          path: [
            'WEB_ORIGIN'
          ],
          message:
            'WEB_ORIGIN must use HTTPS in production'
        });
      }
    }
  );

export const env =
  schema.parse(
    process.env
  );
