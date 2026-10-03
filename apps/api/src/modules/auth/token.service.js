import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';

const ISSUER = 'sams-library-api';
const AUDIENCE = 'sams-library-web';

export function issueAccessToken(user) {
  const roles = user.userRoles.map(({ role }) => role.name);

  return jwt.sign(
    {
      email: user.universityEmail,
      roles
    },
    env.AUTH_TOKEN_SECRET,
    {
      subject: user.id,
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: env.AUTH_TOKEN_EXPIRES_IN
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.AUTH_TOKEN_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE
  });
}
