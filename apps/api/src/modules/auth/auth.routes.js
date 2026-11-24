import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { AppError } from '../../utils/app-error.js';
import { devLogin, revokeOwnSessions } from './auth.service.js';
import { recordSecurityEvent } from '../../utils/audit.js';

export const authRouter = Router();

const devLoginSchema = z.object({
  universityEmail: z.string().email()
});

authRouter.post('/dev-login', async (req, res, next) => {
  try {
    const parsed = devLoginSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'A valid universityEmail is required');
    }

    let result;
    try {
      result = await devLogin(parsed.data.universityEmail);
    } catch (error) {
      if (error?.code === 'INVALID_DEV_USER') {
        recordSecurityEvent('LOGIN_FAILED', { entityId: 'login', metadata: { email: parsed.data.universityEmail.toLowerCase().slice(0, 254) } });
      }
      throw error;
    }
    recordSecurityEvent('LOGIN_SUCCEEDED', { actor: { id: result.user.id }, entityId: result.user.id });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.auth });
});

authRouter.post('/logout-all', authenticate, async (req, res, next) => {
  try {
    // Only the verified caller can be revoked. No target is read from the body.
    if (req.body !== undefined && (req.body === null || typeof req.body !== 'object'
      || Array.isArray(req.body) || Object.keys(req.body).length > 0)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Logout-all does not accept request fields');
    }
    await revokeOwnSessions({ userId: req.auth.id, expectedVersion: req.authContext.authVersion,
      requestId: req.requestId });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});
