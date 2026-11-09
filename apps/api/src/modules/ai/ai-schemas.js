import { z } from 'zod';
import { aiError, protocolError } from './ai-errors.js';

// JS length counts UTF-16 units; Python len counts Unicode code points.
// Match Python str.strip(), including NEL and U+001C..U+001F, excluding BOM.
const pythonTrim = (s) => s.replace(/^[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu, '');
const text = (max) => z.string().transform(pythonTrim).refine((s) => {
  const length = [...s].length;
  return length >= 1 && length <= max && !/[\uD800-\uDFFF]/u.test(s);
});
export const handle = z.string().max(64).regex(/^[a-f0-9]{32}$/);
export const bookCode = z.string().refine((s) => [...s].length >= 1 && [...s].length <= 64 &&
  !/[\s\p{Cc}\p{Cf};/\\]/u.test(s) && !s.includes('..') && !/[\uD800-\uDFFF]/u.test(s));
const optional = (type) => type.nullish();
const filters = z.object({
  author: optional(z.union([text(200), z.array(text(200)).min(1).max(10)])),
  title: optional(text(200)),
  topics: optional(z.array(text(200)).min(1).max(10)),
  topics_mode: z.enum(['any', 'all']).optional(),
  year_from: optional(z.number().int().min(1900).max(2030)),
  year_to: optional(z.number().int().min(1900).max(2030)),
  language: optional(z.enum(['ar', 'en'])),
  publisher: optional(text(200))
}).strict().refine((f) => f.year_from == null || f.year_to == null || f.year_from <= f.year_to);
export const askRequest = z.object({ question: text(500), session_id: optional(handle), filters: optional(filters) }).strict();
export const researchAskRequest = z.object({ question: text(500) }).strict();
export const resetRequest = z.object({ session_id: handle }).strict();

export function validate(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw aiError(400, 'VALIDATION_ERROR');
  return parsed.data;
}

export function queryWait(originalUrl, polling = false) {
  const params = new URL(originalUrl, 'http://local').searchParams;
  for (const key of params.keys()) {
    if (!polling || key !== 'wait' || params.getAll(key).length !== 1) throw aiError(400, 'VALIDATION_ERROR');
  }
  if (!params.has('wait')) return 10;
  const raw = params.get('wait');
  const wait = Number(raw);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) || !Number.isFinite(wait) || wait < 0 || wait > 25) {
    throw aiError(400, 'VALIDATION_ERROR');
  }
  return wait;
}

export const CARD_FIELDS = [
  'Title', 'Authors', 'Topics', 'Subject codes', 'Publishing date', 'Publisher',
  'Publisher country', 'Edition', 'Edition remarks', 'ISBN', 'Book code',
  'Call number', 'Section number', 'Extent', 'Dimensions', 'Number of copies',
  'Number of volumes', 'Note', 'Series', 'Copy codes', 'Copy general numbers', 'Copy other numbers'
];
// Upstream objects strip unknown fields; browser inputs above are strict.
// In particular an upstream identity/availability/cover field cannot cross the boundary.
const card = z.object(Object.fromEntries(CARD_FIELDS.map((key) => [key, z.string()])));
const nullableText = z.string().nullable();
const metadata = {
  book_codes: z.array(bookCode), title: nullableText, author: nullableText,
  year: z.number().int().nullable(), call_number: nullableText
};
const appliedFilters = z.object({
  author: optional(z.union([z.string(), z.array(z.string())])), title: optional(z.string()),
  topics: optional(z.array(z.string())), topics_mode: optional(z.string()),
  year_from: optional(z.number().int()), year_to: optional(z.number().int()),
  language: optional(z.enum(['ar', 'en'])), publisher: optional(z.string())
});
const preview = z.object({
  search_query: nullableText, filters_applied: appliedFilters,
  books: z.array(z.object({ tag: z.string(), ...metadata }))
});
const result = z.object({
  answer: z.string(), is_refusal: z.boolean(), hint: nullableText,
  coverage_note: nullableText, search_query: nullableText, filters_applied: appliedFilters,
  provider: z.enum(['gemini', 'extractive', 'help']), model: nullableText,
  latency_s: z.number().finite().nonnegative(),
  citations: z.object({ cited: z.array(z.string()), inferred: z.array(z.string()), invalid: z.array(z.string()) }),
  sources: z.array(z.object({ tag: z.string(), ...metadata, card })),
  all_books: z.object({ complete: z.boolean(), items: z.array(z.object({
    n: z.number().int().positive(), ...metadata, copies: z.number().int(), in_answer: z.boolean()
  })) }).nullable(), notice: nullableText
});
const internalId = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
export const askResponse = z.discriminatedUnion('status', [
  z.object({ status: z.literal('done'), session_id: internalId, result, cached: z.literal(true).optional() }),
  z.object({ status: z.literal('pending'), session_id: internalId, job_id: internalId, message: z.string(), preview: preview.nullable() }),
  z.object({ status: z.literal('error'), session_id: internalId, message: z.string() })
]);
export const cardResponse = z.object({ book_code: bookCode, card });
export const resetResponse = z.object({ status: z.literal('ok'), session_id: internalId });
export const healthResponse = z.object({
  status: z.literal('ok'),
  engine: z.object({
    books: z.number().int().nonnegative(), chunks: z.number().int().nonnegative(),
    embedding_backend: z.string(), embedding_loaded_from: nullableText,
    reranker: z.boolean(), reranker_loaded_from: nullableText,
    near_duplicate_pairs: z.number().int().nonnegative(), language_changes: z.number().int().nonnegative()
  }),
  settings: z.object({
    wait_s: z.number().finite().min(0).max(10),
    gemini_budget_s: z.number().finite().nonnegative(), rate_limit_per_min: z.number().int()
  })
});

export function projectUpstream(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw protocolError();
  return parsed.data;
}
