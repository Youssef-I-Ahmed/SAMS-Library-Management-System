import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { AppError } from '../../utils/app-error.js';
import { devLogin } from './auth.service.js';

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

    const result = await devLogin(parsed.data.universityEmail);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.auth });
});
