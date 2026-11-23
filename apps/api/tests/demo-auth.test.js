import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

vi.mock('../src/config/prisma.js', () => ({ prisma: {
  user: { findMany: vi.fn() }, $transaction: vi.fn()
} }));
vi.mock('../src/config/env.js', () => ({ env: {
  NODE_ENV: 'development', DEV_AUTH_ENABLED: true, DEMO_AUTH_ENABLED: true,
  AUTH_TOKEN_SECRET: 'local-demo-auth-test-secret-with-at-least-32-characters',
  AUTH_TOKEN_EXPIRES_IN: '7d'
} }));
import { env } from '../src/config/env.js';
import { prisma } from '../src/config/prisma.js';
import { prepareDemoAuth } from '../src/modules/auth/auth.service.js';
import { authRouter } from '../src/modules/auth/auth.routes.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { authorize } from '../src/middleware/authorize.js';

const roles = ['STUDENT', 'LIBRARIAN', 'MANAGEMENT'];
const users = roles.map((role, index) => ({
  id: `${index + 1}1111111-1111-4111-8111-111111111111`,
  universityEmail: `${role.toLowerCase()}@sams.dev`, displayName: role,
  isActive: true, authVersion: 1, userRoles: [{ role: { name: role } }], student: null
}));
const app = express();
app.use(express.json());
app.use('/auth', authRouter);
app.get('/staff', authenticate, authorize('LIBRARIAN'), (_req, res) => res.sendStatus(204));
app.use((error, _req, res, _next) => res.status(error.statusCode ?? 500).json({ code: error.code }));
const login = email => request(app).post('/auth/dev-login').send({ universityEmail: email });
const me = token => request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);

beforeEach(async () => {
  vi.resetAllMocks();
  Object.assign(env, { NODE_ENV: 'development', DEV_AUTH_ENABLED: true, DEMO_AUTH_ENABLED: true });
  prisma.user.findMany.mockResolvedValue(structuredClone(users));
  prisma.$transaction.mockRejectedValue(new Error('Database auth reads unavailable'));
  await prepareDemoAuth();
});

describe('local presentation accounts', () => {
  it.each(users)('allows switching into $displayName without another DB auth lookup', async user => {
    const result = await login(user.universityEmail).expect(200);
    expect(result.body.user.roles).toEqual([user.displayName]);
    await me(result.body.accessToken).expect(200);
    await me(result.body.accessToken).expect(200);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unknown accounts, missing sessions and forged sessions', async () => {
    await login('unknown@sams.dev').expect(401);
    await request(app).get('/auth/me').expect(401);
    await me('invalid-token').expect(401);
  });

  it('retains the selected role instead of giving every demo account staff access', async () => {
    const student = (await login(users[0].universityEmail)).body.accessToken;
    const librarian = (await login(users[1].universityEmail)).body.accessToken;
    await request(app).get('/staff').set('Authorization', `Bearer ${student}`).expect(403);
    await request(app).get('/staff').set('Authorization', `Bearer ${librarian}`).expect(204);
  });

  it('supports account-wide logout in memory and a fresh presentation login', async () => {
    const token = (await login(users[0].universityEmail)).body.accessToken;
    await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${token}`).expect(204);
    await me(token).expect(401);
    await me((await login(users[0].universityEmail)).body.accessToken).expect(200);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('resumes database auth checks when presentation mode is off', async () => {
    const token = (await login(users[0].universityEmail)).body.accessToken;
    env.DEMO_AUTH_ENABLED = false;
    await me(token).expect(503);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('never uses the presentation snapshot outside development', async () => {
    const token = (await login(users[0].universityEmail)).body.accessToken;
    env.NODE_ENV = 'production';
    await login(users[0].universityEmail).expect(404);
    await me(token).expect(503);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects enabling presentation mode in production configuration', () => {
    expect(() => execFileSync(process.execPath, ['--input-type=module', '-e',
      "await import('./src/config/env.js')"], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'pipe',
      env: { ...process.env, NODE_ENV: 'production', DEV_AUTH_ENABLED: 'false',
        DEMO_AUTH_ENABLED: 'true', AI_ENABLED: 'false', WEB_ORIGIN: 'https://example.invalid',
        AUTH_TOKEN_SECRET: 'a'.repeat(48), DATABASE_URL: 'postgresql://unused@localhost/unused' }
    })).toThrow();
  });
});
