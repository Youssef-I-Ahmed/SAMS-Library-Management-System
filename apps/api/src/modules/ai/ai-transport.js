import http from 'node:http';
import https from 'node:https';
import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';
import { setTimeout as delay } from 'node:timers/promises';
import { randomInt } from 'node:crypto';
import { parseUniqueJson } from './ai-json.js';
import { aiError, protocolError, unavailable } from './ai-errors.js';

function httpError(status, operation) {
  let error;
  if (status === 429) {
    error = aiError(429, 'AI_RATE_LIMITED'); error.retryAfter = 60;
  } else if (status === 409) error = aiError(409, 'AI_SESSION_BUSY');
  else if (status === 422) error = aiError(502, 'AI_UPSTREAM_CONTRACT_MISMATCH');
  else if (status === 404 && ['poll', 'card'].includes(operation)) {
    error = aiError(404, operation === 'poll' ? 'AI_JOB_NOT_FOUND' : 'AI_BOOK_NOT_FOUND');
  } else if (status === 401 || status >= 500) error = unavailable();
  else error = protocolError();
  error.upstreamStatus = status;
  error.retryable = [502, 503, 504].includes(status);
  return error;
}

export function createTransport(config, { jitter = () => randomInt(500, 1501) } = {}) {
  function attempt({ method, path, body, user, requestId, operation, signal }, remaining) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let response;
      let decoded;
      let connectTimer;
      const abortError = () => {
        const error = aiError(504, 'AI_UPSTREAM_TIMEOUT'); error.cancelled = true; return error;
      };
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimer); clearTimeout(connectTimer);
        signal?.removeEventListener('abort', onAbort);
        if (error) {
          decoded?.destroy(); response?.destroy(); req.destroy();
          reject(error);
        } else resolve(value);
      };
      const onAbort = () => finish(abortError());
      const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const headers = {
        'X-Service-Key': config.RAG_SERVICE_KEY,
        'X-User-Id': user.id,
        'X-User-Role': [...new Set(user.roles)].sort().join(','),
        'X-Request-Id': requestId
      };
      if (bytes) {
        headers['Content-Type'] = 'application/json';
        headers['Content-Length'] = String(bytes.length);
      }
      const url = new URL(path, `${config.RAG_URL}/`);
      const req = (url.protocol === 'https:' ? https : http).request(url, { method, headers }, (res) => {
        response = res;
        if (res.statusCode !== 200) return finish(httpError(res.statusCode, operation));
        if (!/^application\/json(?:\s*;|$)/i.test(res.headers['content-type'] ?? '')) return finish(protocolError());
        const encoding = (res.headers['content-encoding'] ?? 'identity').toLowerCase();
        if (encoding === 'identity') decoded = res;
        else if (encoding === 'gzip') decoded = createGunzip();
        else if (encoding === 'deflate') decoded = createInflate();
        else if (encoding === 'br') decoded = createBrotliDecompress();
        else return finish(protocolError());
        res.on('error', () => finish(protocolError()));
        res.on('aborted', () => finish(protocolError()));
        if (decoded !== res) res.pipe(decoded);
        let size = 0;
        const chunks = [];
        decoded.on('data', (chunk) => {
          size += chunk.length;
          if (size > config.AI_RESPONSE_MAX_BYTES) return finish(aiError(502, 'AI_RESPONSE_TOO_LARGE'));
          chunks.push(chunk);
        });
        decoded.on('error', () => finish(protocolError()));
        decoded.on('end', () => {
          if (settled) return;
          try {
            const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
            finish(null, parseUniqueJson(text));
          } catch { finish(protocolError()); }
        });
      });
      const timeout = () => {
        const error = aiError(504, 'AI_UPSTREAM_TIMEOUT'); error.retryable = true; finish(error);
      };
      const totalTimer = setTimeout(timeout, Math.max(1, remaining));
      req.on('socket', (socket) => {
        if (settled || !socket.connecting) return;
        connectTimer = setTimeout(timeout, Math.min(2000, remaining));
        socket.once(url.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer));
      });
      req.on('error', () => {
        const error = unavailable(); error.retryable = true; finish(error);
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
      else req.end(bytes);
    });
  }

  return async function transport(options, timeoutMs) {
    const deadline = performance.now() + timeoutMs;
    for (let n = 0; ; n++) {
      try { return await attempt(options, Math.max(1, deadline - performance.now())); }
      catch (error) {
        const pause = jitter();
        if (options.method !== 'GET' || n !== 0 || !error.retryable || error.cancelled ||
            options.signal?.aborted || deadline - performance.now() <= pause + 1) throw error;
        try { await delay(pause, undefined, { signal: options.signal }); }
        catch { throw error; }
      }
    }
  };
}
