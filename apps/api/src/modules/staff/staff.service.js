// Librarian accounts managed by Management: create, activate/deactivate, permissions.
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../utils/app-error.js';
import { writeAudit } from '../../utils/audit.js';
import { GROUP_IDS, LIBRARIAN_PERMISSION_KEYS, groupsForKeys, keysForGroups } from './staff-permissions.js';

const librarianSelect = {
  id: true, universityEmail: true, displayName: true, isActive: true, isProtected: true, createdAt: true,
  userRoles: { select: { role: { select: { name: true } } } },
  permissionGrants: { where: { kind: 'USE', scope: 'GLOBAL' }, select: { permissionKey: true } }
};

function view(user) {
  const keys = user.permissionGrants.map((grant) => grant.permissionKey);
  return {
    id: user.id,
    universityEmail: user.universityEmail,
    displayName: user.displayName,
    isActive: user.isActive,
    createdAt: user.createdAt,
    roles: user.userRoles.map(({ role }) => role.name),
    permissions: groupsForKeys(keys)
  };
}

const isLibrarianOnly = (user) => !user.isProtected && user.userRoles.length === 1 && user.userRoles[0].role.name === 'LIBRARIAN';

async function requireLibrarian(tx, id) {
  const user = await tx.user.findUnique({ where: { id }, select: librarianSelect });
  if (!user) throw new AppError(404, 'NOT_FOUND', 'Librarian not found');
  if (!isLibrarianOnly(user)) {
    throw new AppError(409, 'PROTECTED_ACCOUNT', 'Only librarian accounts can be managed here');
  }
  return user;
}

const conflict = (error) => {
  if (error?.code === 'P2002') return new AppError(409, 'EMAIL_ALREADY_IN_USE', 'This email already belongs to an account');
  if (error?.code === 'P2034') return new AppError(409, 'STAFF_CONFLICT', 'The account changed at the same time; try again');
  return error;
};

async function run(work) {
  try {
    return await prisma.$transaction(work, { isolationLevel: 'Serializable' });
  } catch (error) { throw conflict(error); }
}

export async function listLibrarians({ includeInactive = true } = {}) {
  const users = await prisma.user.findMany({
    where: { userRoles: { some: { role: { name: 'LIBRARIAN' } } }, ...(includeInactive ? {} : { isActive: true }) },
    select: librarianSelect,
    orderBy: { displayName: 'asc' }
  });
  return users.map((user) => ({ ...view(user), manageable: isLibrarianOnly(user) }));
}

async function replaceGrants(tx, userId, groups, actor, reason) {
  const wanted = new Set(keysForGroups(groups));
  const current = await tx.permissionGrant.findMany({
    where: { userId, kind: 'USE', scope: 'GLOBAL', permissionKey: { in: LIBRARIAN_PERMISSION_KEYS } },
    select: { id: true, permissionKey: true }
  });
  const have = new Set(current.map((grant) => grant.permissionKey));
  const remove = current.filter((grant) => !wanted.has(grant.permissionKey)).map((grant) => grant.id);
  const add = [...wanted].filter((key) => !have.has(key));
  if (remove.length) await tx.permissionGrant.deleteMany({ where: { id: { in: remove } } });
  if (add.length) {
    await tx.permissionGrant.createMany({ data: add.map((permissionKey) => ({
      userId, permissionKey, kind: 'USE', scope: 'GLOBAL', branchId: null, grantedByUserId: actor.id, reason
    })) });
  }
  return { before: groupsForKeys([...have]), added: add, removed: current.filter((g) => !wanted.has(g.permissionKey)).map((g) => g.permissionKey) };
}

export async function createLibrarian({ universityEmail, displayName, permissions = GROUP_IDS }, actor) {
  const email = universityEmail.trim().toLowerCase();
  return run(async (tx) => {
    const existing = await tx.user.findFirst({ where: { universityEmail: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (existing) throw new AppError(409, 'EMAIL_ALREADY_IN_USE', 'This email already belongs to an account');
    const role = await tx.role.findUnique({ where: { name: 'LIBRARIAN' } });
    if (!role) throw new AppError(500, 'ROLE_NOT_CONFIGURED', 'Required role LIBRARIAN is not configured');
    const user = await tx.user.create({ data: { universityEmail: email, displayName: displayName.trim() }, select: { id: true } });
    await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
    await replaceGrants(tx, user.id, permissions, actor, 'Set by Management when the account was created');
    await writeAudit(tx, { actor, action: 'LIBRARIAN_CREATED', entityType: 'User', entityId: user.id,
      newValues: { universityEmail: email, displayName: displayName.trim(), permissions } });
    return view(await tx.user.findUnique({ where: { id: user.id }, select: librarianSelect }));
  });
}

export async function updateLibrarian(id, { displayName, isActive, permissions }, actor) {
  if (id === actor.id) throw new AppError(409, 'SELF_CHANGE_NOT_ALLOWED', 'You cannot change your own account here');
  return run(async (tx) => {
    const before = await requireLibrarian(tx, id);
    const data = {};
    if (displayName !== undefined && displayName.trim() !== before.displayName) data.displayName = displayName.trim();
    if (isActive !== undefined && isActive !== before.isActive) {
      data.isActive = isActive;
      // Deactivation ends the account's open sessions.
      if (!isActive) data.authVersion = { increment: 1 };
    }
    if (Object.keys(data).length) await tx.user.update({ where: { id }, data });
    if (data.isActive !== undefined) {
      await writeAudit(tx, { actor, action: isActive ? 'LIBRARIAN_ACTIVATED' : 'LIBRARIAN_DEACTIVATED',
        entityType: 'User', entityId: id, oldValues: { isActive: before.isActive }, newValues: { isActive } });
    }
    if (data.displayName) {
      await writeAudit(tx, { actor, action: 'LIBRARIAN_UPDATED', entityType: 'User', entityId: id,
        oldValues: { displayName: before.displayName }, newValues: { displayName: data.displayName } });
    }
    if (permissions !== undefined) {
      // Grant changes also end the account's sessions (a database trigger advances authVersion).
      const change = await replaceGrants(tx, id, permissions, actor, 'Changed by Management');
      if (change.added.length || change.removed.length) {
        await writeAudit(tx, { actor, action: 'LIBRARIAN_PERMISSIONS_CHANGED', entityType: 'User', entityId: id,
          oldValues: { permissions: change.before }, newValues: { permissions: groupsForKeys(keysForGroups(permissions)) },
          metadata: { added: change.added, removed: change.removed } });
      }
    }
    return view(await tx.user.findUnique({ where: { id }, select: librarianSelect }));
  });
}

/**
 * One-time setup for librarians that existed before permissions were enforced:
 * gives every active, librarian-only account with no grants the full set.
 */
export async function grantBaselineToUnconfiguredLibrarians(grantorEmail, db = prisma) {
  return db.$transaction(async (tx) => {
    const grantor = await tx.user.findUnique({ where: { universityEmail: grantorEmail }, select: librarianSelect });
    if (!grantor?.isActive || !grantor.userRoles.some(({ role }) => role.name === 'MANAGEMENT')) {
      throw new Error('The grantor must be an active Management account');
    }
    const librarians = await tx.user.findMany({
      where: { isActive: true, userRoles: { some: { role: { name: 'LIBRARIAN' } } } }, select: librarianSelect
    });
    const done = [];
    for (const user of librarians) {
      if (!isLibrarianOnly(user) || user.permissionGrants.length) continue;
      await replaceGrants(tx, user.id, GROUP_IDS, grantor, 'Baseline when librarian permissions were introduced');
      await writeAudit(tx, { actor: grantor, action: 'LIBRARIAN_PERMISSIONS_CHANGED', entityType: 'User', entityId: user.id,
        newValues: { permissions: GROUP_IDS }, metadata: { source: 'baseline' } });
      done.push(user.universityEmail);
    }
    return done;
  }, { isolationLevel: 'Serializable' });
}
