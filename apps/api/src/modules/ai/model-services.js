import jwt from 'jsonwebtoken';
import { aiError, unavailable } from './ai-errors.js';

const MAX_RESPONSE_BYTES = 1_048_576;

/** Reads an optional `http(s)://host:port` origin; anything else counts as "not configured". */
export function serviceOrigin(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || !['', '/'].includes(url.pathname)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Minimal JSON client for one internal Python service. Fixed paths only, bounded
 * response size and time, and fixed error codes: upstream text never reaches clients.
 */
export function createServiceClient({ url, headers = () => ({}), timeoutMs = 8000, fetchImpl = globalThis.fetch }) {
  const origin = serviceOrigin(url);
  async function request(method, path, body, extra = {}) {
    if (!origin) throw unavailable();
    let response;
    try {
      response = await fetchImpl(origin + path, {
        method,
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers(), ...extra },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      throw error?.name === 'TimeoutError' ? aiError(504, 'AI_UPSTREAM_TIMEOUT') : unavailable();
    }
    const raw = await response.text().catch(() => '');
    if (raw.length > MAX_RESPONSE_BYTES) throw aiError(502, 'AI_RESPONSE_TOO_LARGE');
    if (!response.ok) {
      const error = aiError(response.status === 422 ? 400 : 502,
        response.status === 422 ? 'VALIDATION_ERROR' : 'AI_UPSTREAM_ERROR');
      error.upstreamStatus = response.status;
      throw error;
    }
    try { return JSON.parse(raw); } catch { throw aiError(502, 'AI_UPSTREAM_PROTOCOL_ERROR'); }
  }
  return {
    configured: Boolean(origin),
    get: (path) => request('GET', path),
    post: (path, body, extra) => request('POST', path, body, extra)
  };
}

const keyHeader = (key) => () => (key ? { 'X-Service-Key': key } : {});

export function createSubjectClassifier({ url, key, fetchImpl } = {}) {
  const client = createServiceClient({ url, headers: keyHeader(key), fetchImpl });
  return {
    configured: client.configured,
    health: () => client.get('/health'),
    async classify(title) {
      const result = await client.post('/predict', { title });
      return { subject: result.subject, confidence: result.confidence, topK: result.top_k };
    }
  };
}

export function createBookClustering({ url, key, fetchImpl } = {}) {
  const client = createServiceClient({ url, headers: keyHeader(key), fetchImpl });
  return {
    configured: client.configured,
    health: () => client.get('/health'),
    predict: ({ title, subjects }) => client.post('/predict', { title, ...(subjects ? { subjects } : {}) })
  };
}

/**
 * Client for services/research-rag. It authenticates with a short-lived HS256
 * service token (the contract in services/research-rag/api/security.py).
 */
export function createResearchService({ url, secret, issuer = 'sadat-express', audience = 'sadat-rag',
  timeoutMs = 12000, fetchImpl } = {}) {
  const client = createServiceClient({ url, timeoutMs, fetchImpl });
  const token = (user) => jwt.sign({ scope: 'rag:read', ...(user?.roles?.[0] ? { role: user.roles[0] } : {}) }, secret,
    { algorithm: 'HS256', issuer, audience, subject: String(user?.id ?? 'sams-api'), expiresIn: 60 });
  const configured = client.configured && typeof secret === 'string' && secret.length >= 32;
  return {
    configured,
    /** Returns the project numbers (record_id = legacy BOOK_CODE) the service cites, best first. */
    async rank(question, user) {
      if (!configured) throw unavailable();
      const reply = await client.post('/ask', { question }, { Authorization: `Bearer ${token(user)}` });
      const sources = [...(Array.isArray(reply.sources) ? reply.sources : []),
        ...(Array.isArray(reply.retrieved) ? reply.retrieved : [])];
      return [...new Set(sources.map((source) => source?.record_id).filter((id) => typeof id === 'string'))];
    }
  };
}

export const subjectClassifier = createSubjectClassifier({
  url: process.env.SUBJECT_CLASSIFIER_URL, key: process.env.SUBJECT_CLASSIFIER_KEY
});
export const bookClustering = createBookClustering({
  url: process.env.BOOK_CLUSTERING_URL, key: process.env.BOOK_CLUSTERING_KEY
});
export const researchService = createResearchService({
  url: process.env.RESEARCH_RAG_URL, secret: process.env.RESEARCH_RAG_JWT_SECRET
});
