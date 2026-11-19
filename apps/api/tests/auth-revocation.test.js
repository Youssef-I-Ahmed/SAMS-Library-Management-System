import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

vi.mock('../src/config/prisma.js', () => ({ prisma: { $transaction: vi.fn(), $executeRaw: vi.fn(),
  user: { findUnique: vi.fn(), update: vi.fn() } } }));
vi.mock('../src/config/env.js', () => ({ env: {
  AUTH_TOKEN_SECRET: 'auth-revocation-fixture-secret-not-an-environment-credential',
  AUTH_TOKEN_EXPIRES_IN: '1h', NODE_ENV: 'test', DEV_AUTH_ENABLED: true
} }));

import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { issueAccessToken, verifyAccessToken } from '../src/modules/auth/token.service.js';
import { devLogin, revokeOwnSessions, toPublicAuthUser } from '../src/modules/auth/auth.service.js';
import { authRouter } from '../src/modules/auth/auth.routes.js';
import { studentsRouter } from '../src/modules/students/students.routes.js';
import { authenticate } from '../src/middleware/authenticate.js';
import { authorize } from '../src/middleware/authorize.js';
import { requestContext } from '../src/middleware/request-context.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const makeUser = (id = ID) => ({ id, authVersion: 1, isActive: true, displayName: 'Fixture User',
  universityEmail: 'fixture@example.invalid', userRoles: [{ role: { name: 'STUDENT' } }], student: null });
const sign = (claims = {}, options = {}) => jwt.sign({ av: 1, ...claims }, env.AUTH_TOKEN_SECRET,
  { subject: ID, issuer: 'sams-library-api', audience: 'sams-library-web', expiresIn: '1h', algorithm: 'HS256', ...options });
function createInstance() {
  const app = express();
  app.use(express.json()); app.use(requestContext);
  app.use('/auth', authRouter);
  app.use('/students', studentsRouter);
  app.get('/staff', authenticate, authorize('LIBRARIAN'), (_req, res) => res.sendStatus(204));
  app.use(errorHandler);
  return app;
}
const app = createInstance();
const anotherInstance = createInstance();
const call = (path, token, instance = app) => request(instance).get(path).set('Authorization', `Bearer ${token}`);
let users, token, logSpy, errorSpy;

beforeEach(() => {
  vi.resetAllMocks();
  env.NODE_ENV = 'test'; env.DEV_AUTH_ENABLED = true;
  users = new Map([[ID, makeUser()], [OTHER, makeUser(OTHER)]]);
  token = issueAccessToken(users.get(ID));
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  prisma.$transaction.mockImplementation(async work => {
    const snapshot = structuredClone(users);
    // This fixture models a stable read snapshot, not PostgreSQL locking/triggers.
    return work({ $executeRaw: prisma.$executeRaw, user: {
      findUnique: async input => {
        await prisma.user.findUnique(input); // injectable database fault/latency
        return snapshot.get(input.where.id) ?? [...snapshot.values()].find(user => user.universityEmail === input.where.universityEmail);
      },
      update: prisma.user.update
    } });
  });
  prisma.$executeRaw.mockResolvedValue(0);
  prisma.user.update.mockImplementation(async ({ where, data }) => {
    const user = users.get(where.id);
    if (!user?.isActive || user.authVersion !== where.authVersion) throw Object.assign(new Error('Fixture missing row'), { code: 'P2025' });
    user.authVersion += data.authVersion.increment;
    return { authVersion: user.authVersion };
  });
});
afterEach(() => { logSpy.mockRestore(); errorSpy.mockRestore(); });

describe('strict access token claims', () => {
  it('issues the authoritative av using HS256 and accepts a valid current JWT', async () => {
    expect(jwt.decode(token, { complete: true }).header.alg).toBe('HS256');
    expect(verifyAccessToken(token)).toMatchObject({ sub: ID, av: 1, iss: 'sams-library-api', aud: 'sams-library-web' });
    const response = await call('/auth/me', token).expect(200);
    expect(response.body).toEqual({ user: toPublicAuthUser(users.get(ID)) });
    expect(response.body.user).not.toHaveProperty('authVersion');
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
  });

  it.each([undefined, null, '1', 0, -1, 1.5, 2_147_483_648])('rejects missing or malformed av %j', async av => {
    await call('/auth/me', sign({ av })).expect(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    [{}, { expiresIn: -1 }],
    [{}, { algorithm: 'HS384' }],
    [{}, { algorithm: 'none' }],
    [{}, { issuer: 'other-issuer' }],
    [{}, { audience: 'other-audience' }],
    [{}, { audience: ['sams-library-web'] }],
    [{}, { subject: 'not-a-uuid' }],
    [{}, { noTimestamp: true }],
    [{ iat: Math.floor(Date.now() / 1000) + 3600 }, {}]
  ])('rejects invalid JWT policy (%#)', async (claims, options) => {
    await call('/auth/me', sign(claims, options)).expect(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a bad signature and a signed token without expiry', async () => {
    const bad = jwt.sign({ av: 1 }, 'a-different-fixture-signing-secret', { subject: ID, expiresIn: '1h' });
    await call('/auth/me', bad).expect(401);
    const noExpiry = jwt.sign({ av: 1 }, env.AUTH_TOKEN_SECRET, { subject: ID, issuer: 'sams-library-api', audience: 'sams-library-web' });
    await call('/auth/me', noExpiry).expect(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cannot issue a legacy token by omitting the authoritative version', () => {
    const user = makeUser(); delete user.authVersion;
    expect(() => issueAccessToken(user)).toThrow();
  });
});

describe('database-backed revocation enforcement', () => {
  it('rejects inactive or removed accounts', async () => {
    users.get(ID).isActive = false;
    await call('/auth/me', token).expect(401);
    users.delete(ID);
    await call('/auth/me', token).expect(401);
  });

  it('rejects tokens after deactivation/reactivation; fresh login binds to the new version', async () => {
    // Simulate committed trigger outcomes only; real SQL behavior is tested separately.
    users.get(ID).isActive = false; users.get(ID).authVersion = 2;
    await call('/auth/me', token).expect(401);
    users.get(ID).isActive = true; users.get(ID).authVersion = 3;
    await call('/auth/me', token).expect(401);
    await call('/auth/me', issueAccessToken(users.get(ID))).expect(200);
  });

  it.each(['assignment', 'removal', 'role rename'])('rejects old sessions after a committed %s invalidation', async kind => {
    const user = users.get(ID);
    user.userRoles = kind === 'assignment' ? [{ role: { name: 'LIBRARIAN' } }] : [];
    user.authVersion++;
    await call('/auth/me', token).expect(401);
    await call('/auth/me', issueAccessToken(user)).expect(200);
  });

  it('uses database roles, not signed JWT role claims', async () => {
    await call('/staff', sign({ roles: ['LIBRARIAN'] })).expect(403);
  });

  it('does not mix User version and roles observed after a concurrent change', async () => {
    prisma.user.findUnique.mockImplementationOnce(async () => {
      users.get(ID).authVersion++;
      users.get(ID).userRoles = [{ role: { name: 'LIBRARIAN' } }];
    });
    await call('/staff', token).expect(403); // old snapshot contains Student permissions only
    await call('/staff', token).expect(401); // subsequent snapshot sees committed revocation
  });

  it('denies access when the database or version schema is unavailable without leaking the exception', async () => {
    const sensitive = 'fixture-database-detail-that-must-not-be-logged';
    prisma.user.findUnique.mockRejectedValueOnce(new Error(sensitive));
    const response = await call('/auth/me', token).expect(503);
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toContain(sensitive);
    delete users.get(ID).authVersion;
    await call('/auth/me', token).expect(503);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(sensitive);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(token);
  });

  it('fails closed before principal lookup if a connection cannot enter primary read-write mode', async () => {
    prisma.$executeRaw.mockRejectedValueOnce(new Error('fixture read-only standby'));
    const response = await call('/auth/me', token).expect(503);
    expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('enforces a revocation across distinct API instances sharing the authoritative store', async () => {
    await call('/auth/me', token, anotherInstance).expect(200);
    await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${token}`).expect(204);
    await call('/auth/me', token, anotherInstance).expect(401);
  });
});

describe('account-wide logout', () => {
  it('revokes multiple sessions, rejects replay and allows only freshly authenticated tokens', async () => {
    const anotherToken = sign({ clientFixture: 'second-session' });
    await call('/auth/me', token).expect(200);
    await call('/auth/me', anotherToken).expect(200);
    await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${token}`).expect(204);
    expect(users.get(ID).authVersion).toBe(2);
    await call('/auth/me', token).expect(401);
    await call('/auth/me', anotherToken).expect(401);
    await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${token}`).expect(401);
    await call('/auth/me', issueAccessToken(users.get(ID))).expect(200);
  });

  it('requires authentication and rejects arbitrary target fields without revoking anyone', async () => {
    await request(app).post('/auth/logout-all').expect(401);
    await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${token}`).send({ userId: OTHER }).expect(400);
    expect(users.get(ID).authVersion).toBe(1);
    expect(users.get(OTHER).authVersion).toBe(1);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('returns audit-ready context only internally, with no tokens, credentials or profile data', async () => {
    const result = await revokeOwnSessions({ userId: ID, expectedVersion: 1, requestId: 'fixture-request-1' });
    expect(result).toEqual({ auditContext: { actorUserId: ID, targetUserId: ID, reasonCode: 'LOGOUT_ALL',
      requestId: 'fixture-request-1', previousVersion: 1, resultingVersion: 2 } });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not report success until the transaction has committed', async () => {
    let releaseCommit;
    const gate = new Promise(resolve => { releaseCommit = resolve; });
    const original = prisma.$transaction.getMockImplementation();
    prisma.$transaction.mockImplementation(async (work, options) => {
      const result = await original(work, options);
      if (options.isolationLevel === 'ReadCommitted') await gate;
      return result;
    });
    let resolved = false;
    const result = revokeOwnSessions({ userId: ID, expectedVersion: 1 }).then(value => { resolved = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(resolved).toBe(false);
    releaseCommit();
    await result;
    expect(resolved).toBe(true);
  });

  it('does not confirm success after a failed commit or retry the write automatically', async () => {
    const original = prisma.$transaction.getMockImplementation();
    const before = structuredClone(users);
    prisma.$transaction.mockImplementationOnce(async (work, options) => {
      await original(work, options);
      users = before; // model the transaction rollback after its write
      throw new Error('fixture failed commit');
    });
    await expect(revokeOwnSessions({ userId: ID, expectedVersion: 1 })).rejects.toMatchObject({ statusCode: 503, code: 'AUTH_UNAVAILABLE' });
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(users.get(ID).authVersion).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('allows only one of two concurrent revocations using the same authenticated version', async () => {
    const results = await Promise.allSettled([revokeOwnSessions({ userId: ID, expectedVersion: 1 }),
      revokeOwnSessions({ userId: ID, expectedVersion: 1 })]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason).toMatchObject({ statusCode: 401 });
    expect(users.get(ID).authVersion).toBe(2);
  });
});

describe('development and Student Import boundaries', () => {
  it('preserves development login response and issues versioned tokens', async () => {
    const response = await request(app).post('/auth/dev-login').send({ universityEmail: 'fixture@example.invalid' }).expect(200);
    expect(response.body).toMatchObject({ tokenType: 'Bearer', expiresIn: '1h', user: toPublicAuthUser(users.get(ID)) });
    expect(verifyAccessToken(response.body.accessToken).av).toBe(1);
  });

  it('rejects dev-login in production, even if the development flag is true', async () => {
    env.NODE_ENV = 'production';
    await request(app).post('/auth/dev-login').send({ universityEmail: 'fixture@example.invalid' }).expect(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(devLogin('fixture@example.invalid')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('keeps Student Import fail-closed for a valid Librarian token', async () => {
    users.get(ID).userRoles = [{ role: { name: 'LIBRARIAN' } }];
    const response = await request(app).post('/students/import').set('Authorization', `Bearer ${issueAccessToken(users.get(ID))}`)
      .send({ students: [] }).expect(403);
    expect(response.body.error.code).toBe('STUDENT_IMPORT_NOT_CONFIGURED');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
