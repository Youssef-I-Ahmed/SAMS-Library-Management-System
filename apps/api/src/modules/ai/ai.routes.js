import { Router, raw } from 'express';
import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { normalizeError } from '../../middleware/error-handler.js';
import { createAiGateway } from './ai-gateway.js';
import { researchRag } from './research-rag.js';
import { aiError } from './ai-errors.js';
import { parseUniqueJson } from './ai-json.js';
import { askRequest, researchAskRequest, resetRequest, handle, bookCode, validate, queryWait } from './ai-schemas.js';

export function aiRequestBoundary(req, res, next) {
  req.aiLogPath = '/api/v1/ai';
  res.set('Cache-Control', 'no-store');
  next();
}

export function createAiRouter({ gateway = createAiGateway({ config: env, db: prisma }),
  research = researchRag, config = env, logging = env.REQUEST_LOGGING && env.NODE_ENV !== 'test' } = {}) {
  const router = Router();
  router.use(aiRequestBoundary);
  router.use((req, res, next) => {
    res.once('close', () => {
      if (!res.writableFinished && logging) console.log(JSON.stringify({
        level: 'info', event: 'ai_client_disconnect', requestId: req.requestId,
        operation: req.aiOperation ?? 'unknown'
      }));
    });
    next();
  });
  router.use(authenticate);
  const allRoles = authorize('STUDENT', 'LIBRARIAN', 'MANAGEMENT');
  const enabled = (_req, _res, next) => { try { gateway.ready(); next(); } catch (error) { next(error); } };
  const bodyParser = raw({ type: () => true, limit: config.AI_REQUEST_MAX_BYTES ?? 8192, inflate: true });
  function body(req, res, next) {
    if ((req.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return next(aiError(415, 'UNSUPPORTED_MEDIA_TYPE'));
    }
    const charset = /(?:^|;)\s*charset\s*=\s*"?([^;"\s]+)/i.exec(req.get('content-type') ?? '');
    if (charset && charset[1].toLowerCase() !== 'utf-8') {
      return next(aiError(415, 'UNSUPPORTED_MEDIA_TYPE'));
    }
    bodyParser(req, res, (error) => {
      if (error) {
        if (error.type === 'entity.too.large') return next(aiError(413, 'PAYLOAD_TOO_LARGE'));
        if (error.status === 415) return next(aiError(415, 'UNSUPPORTED_MEDIA_TYPE'));
        return next(aiError(400, 'INVALID_JSON'));
      }
      try {
        req.body = parseUniqueJson(new TextDecoder('utf-8', { fatal: true }).decode(req.body));
        next();
      } catch { next(aiError(400, 'INVALID_JSON')); }
    });
  }
  function endpoint(operation, run) {
    return async (req, res, next) => {
      req.aiOperation = operation;
      const abort = new AbortController();
      const close = () => { if (!res.writableFinished) abort.abort(); };
      res.once('close', close);
      try {
        if (req.method === 'GET' && (req.get('transfer-encoding') || Number(req.get('content-length')) > 0)) {
          throw aiError(400, 'VALIDATION_ERROR');
        }
        const context = { user: req.auth, requestId: req.requestId };
        const data = await run(req, context, abort.signal);
        if (!res.destroyed) res.json({ data });
      } catch (error) { if (!res.destroyed) next(error); }
      finally { res.off('close', close); }
    };
  }
  // Express otherwise automatically services HEAD via GET handlers.
  router.use((req, _res, next) => next(['GET', 'POST'].includes(req.method)
    ? undefined : aiError(405, 'METHOD_NOT_ALLOWED')));
  router.post('/ask', allRoles, enabled, body, endpoint('ask', (req, ctx) => {
    queryWait(req.originalUrl); return gateway.ask(ctx, validate(askRequest, req.body));
  }));
  router.get('/jobs/:jobId', allRoles, enabled, endpoint('poll', (req, ctx, signal) => {
    const id = validate(handle, req.params.jobId);
    return gateway.poll(ctx, id, queryWait(req.originalUrl, true), signal);
  }));
  router.get('/books/:bookCode', allRoles, enabled, endpoint('card', (req, ctx, signal) => {
    queryWait(req.originalUrl); return gateway.book(ctx, validate(bookCode, req.params.bookCode), signal);
  }));
  router.post('/session/reset', allRoles, enabled, body, endpoint('reset', (req, ctx) => {
    queryWait(req.originalUrl); return gateway.reset(ctx, validate(resetRequest, req.body).session_id);
  }));
  router.get('/health', allRoles, enabled, endpoint('health', (req, ctx, signal) => {
    queryWait(req.originalUrl); return gateway.health(ctx, signal);
  }));
  router.post('/research/ask', allRoles, body, endpoint('research_ask', (req, ctx) => {
    queryWait(req.originalUrl);
    const { question } = validate(researchAskRequest, req.body);
    gateway.state.throttle(ctx.user.id, 'research_ask', 20);
    return research.ask(question);
  }));
  router.get('/research/health', allRoles, endpoint('research_health', (req, ctx) => {
    queryWait(req.originalUrl);
    gateway.state.throttle(ctx.user.id, 'research_health', 30);
    return research.health();
  }));
  router.use((_req, _res, next) => next(aiError(404, 'NOT_FOUND')));
  router.use((error, req, res, _next) => {
    if (res.destroyed || res.headersSent) return;
    // The global logger includes err.message/stack; do not send parser/DB/upstream
    // exceptions there, or reflect validation input through a 4xx message.
    const normalized = normalizeError(error);
    const allowed = new Set(['UNAUTHORIZED', 'INVALID_TOKEN', 'FORBIDDEN', 'VALIDATION_ERROR', 'INVALID_JSON',
      'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'METHOD_NOT_ALLOWED', 'NOT_FOUND', 'AI_SESSION_NOT_FOUND',
      'AI_JOB_NOT_FOUND', 'AI_BOOK_NOT_FOUND', 'AI_UPSTREAM_ERROR', 'AI_UPSTREAM_PROTOCOL_ERROR',
      'AI_RESPONSE_TOO_LARGE', 'AI_CATALOG_UNAVAILABLE', 'AI_CAPACITY_BUSY', 'AI_SERVICE_UNAVAILABLE',
      'AI_SESSION_BUSY', 'AI_RATE_LIMITED', 'AI_UPSTREAM_CONTRACT_MISMATCH', 'AI_UPSTREAM_TIMEOUT']);
    const invalidPath = error instanceof URIError;
    const code = invalidPath ? 'VALIDATION_ERROR' : allowed.has(normalized.code) ? normalized.code : 'AI_SERVICE_UNAVAILABLE';
    const status = invalidPath ? 400 : !allowed.has(normalized.code) ? 503 : normalized.statusCode;
    if (logging) console.log(JSON.stringify({
      level: status >= 500 ? 'error' : 'info', event: 'ai_request_error',
      operation: req.aiOperation ?? 'unknown', requestId: req.requestId, code, status,
      ...(error.sessionId ? { sessionHash: createHash('sha256').update(error.sessionId).digest('hex').slice(0, 12) } : {}),
      ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {})
    }));
    if (error.retryAfter) res.set('Retry-After', String(error.retryAfter));
    res.status(status).json({ error: { code, message: 'AI request could not be completed', requestId: req.requestId ?? null },
      ...(error.sessionId ? { session_id: error.sessionId } : {}) });
  });
  return router;
}

export const aiRouter = createAiRouter();
