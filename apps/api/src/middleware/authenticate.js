import { AppError } from '../utils/app-error.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import {
  getAuthUserById,
  toPublicAuthUser
} from '../modules/auth/auth.service.js';

export async function authenticate(req, _res, next) {
  try {
    const authorization = req.get('authorization');

    if (!authorization?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Bearer token is required');
    }

    const token = authorization.slice('Bearer '.length).trim();

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Access token is invalid or expired');
    }

    const user = await getAuthUserById(payload.sub);

    req.auth = toPublicAuthUser(user);
    next();
  } catch (error) {
    next(error);
  }
}
