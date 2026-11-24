import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Neither a real PrismaClient nor environment files are loaded by this suite.
vi.mock('../src/config/prisma.js', () => ({ prisma: {
  $transaction: vi.fn(), user: { findUnique: vi.fn() },
  student: { count: vi.fn(), findMany: vi.fn() },
  permissionGrant: { findMany: vi.fn(async () => [{ permissionKey: 'students.directory.read' }]) }
} }));
vi.mock('../src/config/env.js', () => ({ env: {
  AUTH_TOKEN_SECRET: 'student-import-test-signing-secret-not-a-real-credential',
  AUTH_TOKEN_EXPIRES_IN: '1h'
} }));

import { prisma } from '../src/config/prisma.js';
import { importStudents } from '../src/modules/students/students.service.js';
import { studentsRouter } from '../src/modules/students/students.routes.js';
import { issueAccessToken } from '../src/modules/auth/token.service.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const record = (overrides = {}) => ({ studentId: 'S-001', universityEmail: 'student@example.invalid',
  displayName: 'Updated Student', ...overrides });
const roles = ['STUDENT', 'LIBRARIAN', 'MANAGEMENT'];
const fixture = () => ({
  users: [{ id: 'student-user', universityEmail: 'student@example.invalid', displayName: 'Original Student',
    isActive: false, roles: ['STUDENT'] }],
  students: [{ userId: 'student-user', studentId: 'S-001', facultyId: 'faculty-a',
    departmentId: 'department-a', academicStatus: 'SUSPENDED' }],
  faculties: [{ id: 'faculty-a', name: 'Faculty A', isActive: true },
    { id: 'faculty-b', name: 'Faculty B', isActive: true }],
  departments: [{ id: 'department-a', name: 'Department A', facultyId: 'faculty-a', isActive: true },
    { id: 'department-a2', name: 'Department A2', facultyId: 'faculty-a', isActive: true }],
  nextId: 1
});
let committed, writes, failAt;

function userView(db, user) {
  return structuredClone({ ...user, userRoles: user.roles.map(name => ({ role: { name } })),
    student: db.students.find(student => student.userId === user.id) ?? null });
}

// A transactional in-memory fixture: writes touch only a private draft. The
// committed snapshot changes only after the complete callback succeeds.
function transactionFixture(db) {
  const write = (operation, data) => {
    writes.push({ operation, data: structuredClone(data) });
    if (failAt?.operation === operation) throw Object.assign(new Error('Fixture write failure'), { code: failAt.code });
  };
  return {
    $executeRaw: async () => 0,
    role: { findUnique: async ({ where }) => roles.includes(where.name) ? { id: roles.indexOf(where.name) + 1 } : null },
    user: {
      findUnique: prisma.user.findUnique,
      findMany: async ({ where, take }) => db.users
        .filter(user => user.universityEmail.toLowerCase() === where.universityEmail.equals.toLowerCase())
        .slice(0, take).map(user => userView(db, user)),
      update: async ({ where, data }) => {
        write('user.update', data);
        const user = db.users.find(user => user.id === where.id);
        Object.assign(user, data);
        return userView(db, user);
      },
      create: async ({ data }) => {
        write('user.create', data);
        const user = { ...data, id: `created-${db.nextId++}`, roles: [] };
        db.users.push(user);
        return userView(db, user);
      }
    },
    student: {
      findMany: async ({ where, take }) => db.students
        .filter(student => student.studentId.toLowerCase() === where.studentId.equals.toLowerCase())
        .slice(0, take).map(student => structuredClone({ ...student,
          user: userView(db, db.users.find(user => user.id === student.userId)),
          faculty: db.faculties.find(faculty => faculty.id === student.facultyId) ?? null,
          department: db.departments.find(department => department.id === student.departmentId) ?? null })),
      update: async ({ where, data }) => {
        write('student.update', data);
        Object.assign(db.students.find(student => student.userId === where.userId), data);
      },
      create: async ({ data }) => { write('student.create', data); db.students.push({ ...data }); }
    },
    userRole: { create: async ({ data }) => {
      write('userRole.create', data);
      db.users.find(user => user.id === data.userId).roles.push(roles[data.roleId - 1]);
    } },
    faculty: { findUnique: async ({ where }) => db.faculties.find(faculty => faculty.name === where.name) ?? null },
    department: { findUnique: async ({ where: { facultyId_name: where } }) => db.departments
      .find(department => department.name === where.name && department.facultyId === where.facultyId) ?? null }
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  committed = fixture(); writes = []; failAt = null;
  prisma.$transaction.mockImplementation(async (callback) => {
    if (Array.isArray(callback)) return Promise.all(callback);
    const draft = structuredClone(committed);
    const result = await callback(transactionFixture(draft));
    committed = draft;
    return result;
  });
  prisma.student.count.mockResolvedValue(0);
  prisma.student.findMany.mockResolvedValue([]);
});

async function rejectedUnchanged(records, code, { preflight = true } = {}) {
  const before = structuredClone(committed);
  await expect(importStudents(records)).rejects.toMatchObject({ statusCode: 409, code });
  expect(committed).toEqual(before);
  if (preflight) expect(writes).toEqual([]);
}

describe('Student import protects existing account identities', () => {
  it.each([
    ['active Librarian', ['LIBRARIAN'], true],
    ['inactive Librarian', ['LIBRARIAN'], false],
    ['Management', ['MANAGEMENT'], true],
    ['unknown protected role', ['OTHER_PROTECTED_ROLE'], true],
    ['unclassified account', [], false]
  ])('rejects %s matched by email without changing names, activation or roles', async (_label, accountRoles, isActive) => {
    committed.users.push({ id: 'protected-user', universityEmail: 'STAFF@example.invalid',
      displayName: 'Protected Staff', isActive, roles: accountRoles });
    await rejectedUnchanged([record({ studentId: 'S-NEW', universityEmail: 'staff@example.invalid', isActive: true })], 'PROTECTED_ACCOUNT');
  });

  it.each([['STUDENT', 'LIBRARIAN'], ['STUDENT', 'MANAGEMENT'], ['STUDENT', 'OTHER_PROTECTED_ROLE'], []])(
    'rejects an existing Student with roles %j even when importing a new email', async (...accountRoles) => {
      committed.users[0].roles = accountRoles;
      await rejectedUnchanged([record({ universityEmail: 'new@example.invalid', isActive: true })], 'PROTECTED_ACCOUNT');
    }
  );

  it('rejects attaching a new institutional identity to an existing Student-only account', async () => {
    await rejectedUnchanged([record({ studentId: 'DIFFERENT-ID' })], 'EXISTING_ACCOUNT_LINK_NOT_ALLOWED');
    committed.students = [];
    await rejectedUnchanged([record()], 'EXISTING_ACCOUNT_LINK_NOT_ALLOWED');
  });

  it('rejects an email owned by a different Student without relinking either account', async () => {
    committed.users.push({ id: 'other-user', universityEmail: 'other@example.invalid', displayName: 'Other Student', isActive: true, roles: ['STUDENT'] });
    committed.students.push({ userId: 'other-user', studentId: 'S-002', facultyId: null, departmentId: null, academicStatus: 'ACTIVE' });
    await rejectedUnchanged([record({ universityEmail: 'other@example.invalid' })], 'EMAIL_ALREADY_IN_USE');
  });

  it('rejects an ambiguous case-insensitive email match', async () => {
    committed.users.push({ ...committed.users[0], id: 'case-duplicate', universityEmail: 'STUDENT@example.invalid' });
    await rejectedUnchanged([record()], 'AMBIGUOUS_EMAIL');
  });

  it('rejects case-only institutional ID changes rather than inventing another Student', async () => {
    await rejectedUnchanged([record({ studentId: 's-001' })], 'AMBIGUOUS_STUDENT_ID');
  });
});

describe('Student import omission, placement and batch semantics', () => {
  it('preserves inactive status, suspended academic status and placement when omitted', async () => {
    const originalStudent = structuredClone(committed.students[0]);
    expect(await importStudents([record()])).toEqual({ total: 1, created: 0, updated: 1,
      results: [{ action: 'updated', studentId: 'S-001', userId: 'student-user' }] });
    expect(committed.users[0]).toMatchObject({ isActive: false, displayName: 'Updated Student', roles: ['STUDENT'] });
    expect(committed.students[0]).toEqual(originalStudent);
    expect(writes.some(write => write.operation === 'userRole.create')).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
  });

  it('supports an explicit valid Student-only update without changing its identity or roles', async () => {
    await importStudents([record({ universityEmail: ' Updated@Example.Invalid ', isActive: true,
      academicStatus: 'GRADUATED', departmentName: 'Department A2' })]);
    expect(committed.users[0]).toMatchObject({ id: 'student-user', universityEmail: 'updated@example.invalid', isActive: true, roles: ['STUDENT'] });
    expect(committed.students[0]).toMatchObject({ userId: 'student-user', studentId: 'S-001',
      facultyId: 'faculty-a', departmentId: 'department-a2', academicStatus: 'GRADUATED' });
  });

  it('supports explicit deactivation and explicit clearing of both academic fields', async () => {
    committed.users[0].isActive = true;
    await importStudents([record({ isActive: false, facultyName: null, departmentName: null })]);
    expect(committed.users[0].isActive).toBe(false);
    expect(committed.students[0]).toMatchObject({ facultyId: null, departmentId: null, academicStatus: 'SUSPENDED' });
  });

  it.each([null, 'Faculty B'])('rejects changing faculty to %j while retaining an incompatible omitted department', async facultyName => {
    await rejectedUnchanged([record({ facultyName })], 'DEPARTMENT_FACULTY_MISMATCH');
  });

  it('creates a fresh User and Student with only the Student role; retains result contract', async () => {
    const result = await importStudents([record({ studentId: 'S-NEW', universityEmail: 'new@example.invalid',
      facultyName: 'Faculty A', departmentName: 'Department A', isActive: false })]);
    expect(result).toEqual({ total: 1, created: 1, updated: 0,
      results: [{ action: 'created', studentId: 'S-NEW', userId: 'created-1' }] });
    expect(committed.users[1]).toMatchObject({ isActive: false, roles: ['STUDENT'] });
    expect(committed.students[1]).toMatchObject({ studentId: 'S-NEW', facultyId: 'faculty-a', departmentId: 'department-a', academicStatus: 'ACTIVE' });
  });

  it.each([
    [record(), record()],
    [record(), record({ studentId: ' S-001 ', universityEmail: 'new@example.invalid' })],
    [record(), record({ studentId: 's-001', universityEmail: 'new@example.invalid' })],
    [record(), record({ studentId: 'S-002', universityEmail: ' STUDENT@EXAMPLE.INVALID ' })]
  ])('rejects duplicate batch identities before opening a transaction (%#)', async (...records) => {
    await rejectedUnchanged(records, 'DUPLICATE_IMPORT_IDENTITY');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([[], Array.from({ length: 501 }, () => record()), [record({ isActive: null })], [record({ academicStatus: null })],
    [record({ universityEmail: 'invalid' })], [record({ studentId: ' ' })]].map(input => [input]))('rejects invalid domain input (%#)', async input => {
    await expect(importStudents(input)).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('preflights every row before writes, including protected accounts later in a batch', async () => {
    committed.users.push({ id: 'staff', universityEmail: 'staff@example.invalid', displayName: 'Staff', isActive: false, roles: ['LIBRARIAN'] });
    await rejectedUnchanged([record(), record({ studentId: 'S-NEW', universityEmail: 'staff@example.invalid' })], 'PROTECTED_ACCOUNT');
  });

  it('does not free another Student email earlier in the batch to silently transfer it', async () => {
    await rejectedUnchanged([record({ universityEmail: 'new@example.invalid' }),
      record({ studentId: 'S-NEW' })], 'EXISTING_ACCOUNT_LINK_NOT_ALLOWED');
  });

  it('rolls back earlier new accounts and updates when a later write fails', async () => {
    const before = structuredClone(committed);
    failAt = { operation: 'student.update', code: 'FIXTURE_FAILURE' };
    await expect(importStudents([record({ studentId: 'S-NEW', universityEmail: 'new@example.invalid' }), record()]))
      .rejects.toMatchObject({ code: 'FIXTURE_FAILURE' });
    expect(writes.map(write => write.operation)).toEqual(['user.create', 'student.create', 'userRole.create', 'user.update', 'student.update']);
    expect(committed).toEqual(before);
  });

  it.each(['P2034', 'P2002'])('returns a reconciliation conflict for %s without automatically replaying writes', async code => {
    failAt = { operation: 'student.update', code };
    await rejectedUnchanged([record()], 'STUDENT_IMPORT_CONFLICT', { preflight: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Student import HTTP access fails closed', () => {
  const app = express();
  app.use(express.json());
  app.use('/students', studentsRouter);
  app.use(errorHandler);

  it('requires authentication before evaluating import access', async () => {
    const response = await request(app).post('/students/import').send({ students: [record()] }).expect(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it.each([['LIBRARIAN'], ['MANAGEMENT'], ['STUDENT'], ['LIBRARIAN', 'MANAGEMENT'], ['SUPER_ADMIN']])(
    'denies roles %j: no role, request body or header substitutes for a trusted integration grant', async (...accountRoles) => {
      const user = { id: '11111111-1111-4111-8111-111111111111', authVersion: 1, isActive: true, universityEmail: 'caller@example.invalid', displayName: 'Fixture Caller',
        userRoles: accountRoles.map(name => ({ role: { name } })), student: null };
      prisma.user.findUnique.mockResolvedValue(user);
      const response = await request(app).post('/students/import')
        .set('Authorization', `Bearer ${issueAccessToken(user)}`)
        .set('X-Integration-Identity', 'untrusted-header')
        .send({ students: [record()], permissions: ['students.import'], trustedIntegration: true }).expect(403);
      expect(response.body.error.code).toBe('STUDENT_IMPORT_NOT_CONFIGURED');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
      expect(writes).toEqual([]);
    }
  );

  it.each(['LIBRARIAN', 'MANAGEMENT'])('preserves %s read-only Directory access', async role => {
    const user = { id: '11111111-1111-4111-8111-111111111111', authVersion: 1, isActive: true, universityEmail: 'caller@example.invalid', displayName: 'Fixture Caller',
      userRoles: [{ role: { name: role } }], student: null };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.permissionGrant.findMany.mockResolvedValue([{ permissionKey: 'students.directory.read' }]);
    const response = await request(app).get('/students').set('Authorization', `Bearer ${issueAccessToken(user)}`).expect(200);
    expect(response.body).toMatchObject({ data: [], pagination: { total: 0 } });
  });

  it('denies a librarian whom Management has not given the directory permission', async () => {
    const user = { id: '11111111-1111-4111-8111-111111111111', authVersion: 1, isActive: true, universityEmail: 'caller@example.invalid', displayName: 'Fixture Caller',
      userRoles: [{ role: { name: 'LIBRARIAN' } }], student: null };
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.permissionGrant.findMany.mockResolvedValueOnce([{ permissionKey: 'analytics.read' }]);
    const response = await request(app).get('/students').set('Authorization', `Bearer ${issueAccessToken(user)}`).expect(403);
    expect(response.body.error.code).toBe('PERMISSION_DENIED');
  });
});
