import { z } from 'zod';

const integer = (value, min, max) => z.coerce.number().int().min(min).max(max).default(value);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.object({
  AI_ENABLED: z.literal('true').transform(() => true),
  RAG_URL: z.string().url().superRefine((value, ctx) => {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== '/') {
      ctx.addIssue({ code: 'custom', message: 'Must be an HTTP(S) origin without credentials' });
    }
  }).transform((value) => new URL(value).origin),
  RAG_SERVICE_KEY: z.string().min(32).max(512).regex(/^[\x21-\x7e]+$/),
  AI_BOOK_CODE_MAP_PATH: z.string().trim().min(1),
  AI_BOOK_CODE_MAP_SHA256: fingerprint,
  AI_SOURCE_SHA256: fingerprint,
  AI_SERVICE_EPOCH: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  AI_BOOK_IDENTITY_MODE: z.enum(['legacy', 'postgres_uuid']).default('legacy'),
  AI_ASK_TIMEOUT_MS: integer(15000, 11000, 15000),
  AI_CARD_TIMEOUT_MS: integer(5000, 100, 5000),
  AI_RESET_TIMEOUT_MS: integer(5000, 100, 5000),
  AI_HEALTH_TIMEOUT_MS: integer(2000, 100, 2000),
  AI_POLL_TIMEOUT_MARGIN_MS: integer(5000, 1000, 5000),
  AI_REQUEST_MAX_BYTES: integer(8192, 8192, 8192),
  AI_RESPONSE_MAX_BYTES: integer(2097152, 2097152, 2097152),
  // Client patience policy, not a Python execution deadline or backend job TTL.
  AI_POLL_WINDOW_MS: integer(240000, 240000, 240000)
});

export function readAiConfig(input) {
  if (input.AI_ENABLED === undefined || input.AI_ENABLED === 'false') {
    return Object.freeze({ AI_ENABLED: false });
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    // Zod errors can include input values. Emit names only, never secret/config values.
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))].sort();
    throw new Error(`Invalid AI configuration: ${names.join(', ')}`);
  }
  return Object.freeze(parsed.data);
}
