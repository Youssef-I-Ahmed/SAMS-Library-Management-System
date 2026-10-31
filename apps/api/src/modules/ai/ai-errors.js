import { AppError } from '../../utils/app-error.js';

export function aiError(status, code) {
  // Fixed text only: never incorporate HTTP payloads, paths, URLs or provider errors.
  return new AppError(status, code, 'AI request could not be completed');
}

export const protocolError = () => aiError(502, 'AI_UPSTREAM_PROTOCOL_ERROR');
export const unavailable = () => aiError(503, 'AI_SERVICE_UNAVAILABLE');

export function withDeadline(promise, ms, error) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(error), ms); })
  ]).finally(() => clearTimeout(timer));
}
