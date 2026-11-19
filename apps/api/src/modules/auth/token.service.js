import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const ISSUER = 'sams-library-api';
const AUDIENCE = 'sams-library-web';
const ALGORITHM = 'HS256'; // jsonwebtoken's existing signing default, now explicit.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAuthVersion(value) {
  return Number.isInteger(value) && value >= 1 && value <= 2_147_483_647;
}

export function issueAccessToken(user) {
  if (!UUID.test(user.id) || !isAuthVersion(user.authVersion)) {
    throw new Error('Cannot issue an access token without a current authentication principal');
  }
  const roles = user.userRoles.map(({ role }) => role.name);

  return jwt.sign(
    {
      email: user.universityEmail,
      roles,
      av: user.authVersion
    },
    env.AUTH_TOKEN_SECRET,
    {
      subject: user.id,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: ALGORITHM,
      expiresIn: env.AUTH_TOKEN_EXPIRES_IN
    }
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.AUTH_TOKEN_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithms: [ALGORITHM]
  });
  const now = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || typeof payload.sub !== 'string' || !UUID.test(payload.sub)
    || payload.iss !== ISSUER || payload.aud !== AUDIENCE
    || !isAuthVersion(payload.av)
    || !Number.isSafeInteger(payload.iat) || payload.iat < 0 || payload.iat > now
    || !Number.isSafeInteger(payload.exp) || payload.exp <= payload.iat || payload.exp <= now) {
    throw new Error('Invalid access token claims');
  }
  return payload;
}
