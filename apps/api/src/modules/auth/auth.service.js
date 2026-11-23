import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/app-error.js';
import { isAuthVersion, issueAccessToken } from './token.service.js';

const userInclude = {
  userRoles: {
    include: {
      role: true
    }
  },
  student: {
    include: {
      faculty: true,
      department: true
    }
  }
};

const unavailable = () => new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication is temporarily unavailable');
const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Authentication is required');

const demoAccounts = new Map([
  ['student@sams.dev', 'STUDENT'],
  ['librarian@sams.dev', 'LIBRARIAN'],
  ['management@sams.dev', 'MANAGEMENT']
]);
let demoUsers = new Map();
const demoEnabled = () => env.DEMO_AUTH_ENABLED === true
  && env.NODE_ENV === 'development' && env.DEV_AUTH_ENABLED === true;

// Local presentation mode snapshots the three existing demo accounts once.
// Ordinary authentication always retains its live DB/revocation checks.
export async function prepareDemoAuth() {
  if (!demoEnabled()) return;
  const users = await prisma.user.findMany({
    where: { universityEmail: { in: [...demoAccounts.keys()] }, isActive: true },
    include: userInclude
  });
  const snapshot = new Map();
  for (const user of users) {
    const role = demoAccounts.get(user.universityEmail);
    if (!role || !user.isActive || !user.userRoles.some(link => link.role.name === role)) continue;
    requireVersion(user);
    snapshot.set(user.id, structuredClone(user));
  }
  if (snapshot.size !== demoAccounts.size) throw unavailable();
  demoUsers = snapshot;
}

function demoUserById(id) {
  const user = demoUsers.get(id);
  if (!user) throw unauthorized();
  return user;
}

async function authTransaction(work, isolationLevel = 'RepeatableRead') {
  try {
    return await prisma.$transaction(async (tx) => {
      // A hot standby cannot enter READ WRITE mode. Fail closed rather than
      // authenticating against a potentially lagging replica. No data is written
      // by this command; User and membership reads then share the same snapshot.
      await tx.$executeRaw`SET TRANSACTION READ WRITE`;
      return work(tx);
    }, { isolationLevel });
  } catch (error) {
    if (error instanceof AppError) throw error;
    // Never pass database messages, connection strings or causes to HTTP loggers.
    throw unavailable();
  }
}

function requireVersion(user) {
  if (!isAuthVersion(user.authVersion)) throw unavailable();
  return user;
}

export function toPublicAuthUser(user) {
  return {
    id: user.id,
    universityEmail: user.universityEmail,
    displayName: user.displayName,
    roles: user.userRoles.map(({ role }) => role.name),
    student: user.student
      ? {
          studentId: user.student.studentId,
          academicStatus: user.student.academicStatus,
          faculty: user.student.faculty
            ? {
                id: user.student.faculty.id,
                name: user.student.faculty.name
              }
            : null,
          department: user.student.department
            ? {
                id: user.student.department.id,
                name: user.student.department.name
              }
            : null
        }
      : null
  };
}

export async function devLogin(universityEmail) {
  if (!env.DEV_AUTH_ENABLED || env.NODE_ENV === 'production') {
    throw new AppError(404, 'NOT_FOUND', 'Route not found');
  }

  const user = demoEnabled()
    ? [...demoUsers.values()].find(user => user.universityEmail === universityEmail)
    : await authTransaction((tx) => tx.user.findUnique({
    where: { universityEmail },
    include: userInclude
  }));

  if (!user || !user.isActive) {
    throw new AppError(401, 'INVALID_DEV_USER', 'Development user is invalid or inactive');
  }
  requireVersion(user);

  return {
    accessToken: issueAccessToken(user),
    tokenType: 'Bearer',
    expiresIn: env.AUTH_TOKEN_EXPIRES_IN,
    user: toPublicAuthUser(user)
  };
}

export async function getAuthUserById(userId) {
  if (demoEnabled()) return demoUserById(userId);
  const user = await authTransaction((tx) => tx.user.findUnique({
    where: { id: userId },
    include: userInclude
  }));

  if (!user || !user.isActive) {
    throw unauthorized();
  }

  return requireVersion(user);
}

export async function revokeOwnSessions({ userId, expectedVersion, requestId }) {
  if (!isAuthVersion(expectedVersion)) throw unauthorized();
  if (expectedVersion === 2_147_483_647) throw unavailable();

  if (demoEnabled()) {
    const user = demoUserById(userId);
    if (user.authVersion !== expectedVersion) throw unauthorized();
    user.authVersion++;
    return;
  }

  // A conditional UPDATE locks the User row and returns its actual resulting
  // version. Concurrent revocations cannot both succeed for the same token.
  return authTransaction(async (tx) => {
    let updated;
    try {
      updated = await tx.user.update({
        where: { id: userId, isActive: true, authVersion: expectedVersion },
        data: { authVersion: { increment: 1 } },
        select: { authVersion: true }
      });
    } catch (error) {
      if (error?.code === 'P2025') throw unauthorized();
      throw error;
    }
    if (updated.authVersion !== expectedVersion + 1) throw unavailable();
    // Returned only after commit. The HTTP route never exposes this context.
    // Future durable audit writing must join this transaction; no logging here.
    return { auditContext: {
      actorUserId: userId,
      targetUserId: userId,
      reasonCode: 'LOGOUT_ALL',
      requestId: typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(requestId) ? requestId : null,
      previousVersion: expectedVersion,
      resultingVersion: updated.authVersion
    } };
  }, 'ReadCommitted');
}
