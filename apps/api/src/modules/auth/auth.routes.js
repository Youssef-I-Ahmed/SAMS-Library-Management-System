import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { AppError } from '../../utils/app-error.js';
import { devLogin, revokeOwnSessions } from './auth.service.js';
import { recordSecurityEvent } from '../../utils/audit.js';
import { prisma } from '../../config/prisma.js';
import { GROUP_IDS, groupsForKeys } from '../staff/staff-permissions.js';

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

// Which librarian permission groups the caller has, so pages can hide what
// they cannot use. The server still checks every request.
authRouter.get('/permissions', authenticate, async (req, res, next) => {
  try {
    if (req.auth.roles.includes('MANAGEMENT')) return res.json({ data: { all: true, groups: GROUP_IDS } });
    if (!req.auth.roles.includes('LIBRARIAN')) return res.json({ data: { all: false, groups: [] } });
    const grants = await prisma.permissionGrant.findMany({
      where: { userId: req.auth.id, kind: 'USE', scope: 'GLOBAL' }, select: { permissionKey: true }
    });
    const groups = groupsForKeys(grants.map((grant) => grant.permissionKey));
    res.json({ data: { all: groups.length === GROUP_IDS.length, groups } });
  } catch (error) { next(error); }
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
