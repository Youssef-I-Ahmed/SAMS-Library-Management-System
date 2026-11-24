const DEFAULT_API_URL = 'http://localhost:4000/api/v1';

export const API_URL = (
  import.meta.env.VITE_API_URL || DEFAULT_API_URL
).replace(/\/+$/, '');

// Server messages are English; these codes get a message in the page language.
const FRIENDLY = {
  PERMISSION_DENIED: {
    ar: 'الإدارة مدّتش حسابك صلاحية للعملية دي. كلّم الإدارة لو محتاجها.',
    en: 'Management has not given your account permission for this action. Ask Management if you need it.'
  },
  AUTH_UNAVAILABLE: {
    ar: 'السيستم مش قادر يتأكد من الدخول دلوقتي. استنى ثواني وجرب تاني.',
    en: 'Sign-in could not be checked right now. Wait a few seconds and try again.'
  }
};
const pageLanguage = () => (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'ar');

export class ApiError extends Error {
  constructor({ status, code, message, requestId, payload }) {
    super(FRIENDLY[code]?.[pageLanguage()] || message || 'Request failed.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'REQUEST_FAILED';
    this.requestId = requestId || null;
    this.payload = payload || null;
  }
}

async function readPayload(response) {
  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

export async function apiRequest(
  path,
  { method = 'GET', token, body, headers, signal } = {}
) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const payload = await readPayload(response);
  const requestId =
    response.headers.get('x-request-id') ||
    payload?.error?.requestId ||
    null;

  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: payload?.error?.code,
      message:
        payload?.error?.message ||
        payload?.message ||
        `Request failed with status ${response.status}.`,
      requestId,
      payload
    });
  }

  return payload;
}
