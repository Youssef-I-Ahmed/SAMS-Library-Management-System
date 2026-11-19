import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../src/config/prisma.js', () => ({ prisma: {
  $transaction: vi.fn(), $executeRaw: vi.fn(), user: { findUnique: vi.fn() },
  libraryItem: { findFirst: vi.fn() }, contributor: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() }
} }));
vi.mock('../src/config/env.js', () => ({ env: {
  NODE_ENV: 'test', AUTH_TOKEN_SECRET: 'catalog-access-only-fixture-signing-secret-not-a-real-credential', AUTH_TOKEN_EXPIRES_IN: '1h'
} }));

import { prisma } from '../src/config/prisma.js';
import { issueAccessToken } from '../src/modules/auth/token.service.js';
import { libraryItemsRouter } from '../src/modules/catalog/library-items.routes.js';
import { contributorsRouter } from '../src/modules/catalog/contributors.routes.js';
import { listItemContributors } from '../src/modules/catalog/item-contributors.service.js';
import { getContributor, listContributors } from '../src/modules/catalog/contributors.service.js';
import { errorHandler, notFound } from '../src/middleware/error-handler.js';

const ACTIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ARCHIVED = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSING = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTRIBUTOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const users = new Map([
  ['STUDENT', '11111111-1111-4111-8111-111111111111'],
  ['LIBRARIAN', '22222222-2222-4222-8222-222222222222'],
  ['MANAGEMENT', '33333333-3333-4333-8333-333333333333']
].map(([role, id]) => [role, { id, authVersion: 1, isActive: true, displayName: 'Fixture',
  universityEmail: `${role.toLowerCase()}@example.invalid`, userRoles: [{ role: { name: role } }], student: null }]));
const app = express(); app.use(express.json());
app.use('/api/v1/catalog/items', libraryItemsRouter);
app.use('/api/v1/catalog/contributors', contributorsRouter);
app.use(notFound); app.use(errorHandler);
const itemPath = id => `/api/v1/catalog/items/${id}`;
const personPath = `/api/v1/catalog/contributors/${CONTRIBUTOR}`;
const get = (path, role = 'STUDENT', query = {}) => request(app).get(path).query(query)
  .set('Authorization', `Bearer ${issueAccessToken(users.get(role))}`);
let items;

function links(where) {
  return [...items.values()].filter(item => !where?.item?.isActive || item.isActive)
    .map(item => ({ itemId: item.id, contributorId: CONTRIBUTOR, role: 'AUTHOR',
      item: { id: item.id, title: item.title, type: item.type, isActive: item.isActive } }));
}

beforeEach(() => {
  vi.resetAllMocks();
  items = new Map([
    [ACTIVE, { id: ACTIVE, title: 'Active fixture item', type: 'BOOK', version: 1, isActive: true,
      bookDetails: { isbn: 'fixture-isbn' }, academicWorkDetails: null, itemContributors: [{ contributor: { fullName: 'Fixture Author' }, role: 'AUTHOR' }] }],
    [ARCHIVED, { id: ARCHIVED, title: 'Archived fixture title must stay hidden', type: 'BOOK', version: 1, isActive: false,
      bookDetails: { isbn: 'private-archived-isbn' }, academicWorkDetails: null, itemContributors: [{ contributor: { fullName: 'Archived Association' }, role: 'AUTHOR' }] }]
  ]);
  prisma.$transaction.mockImplementation(work => typeof work === 'function' ? work(prisma) : Promise.all(work));
  prisma.$executeRaw.mockResolvedValue(0);
  prisma.user.findUnique.mockImplementation(async ({ where }) => [...users.values()].find(user => user.id === where.id));
  // Read-only query fixture respects the actual service predicates, as PostgreSQL
  // would. Assertions below also require those predicates to be sent to Prisma.
  prisma.libraryItem.findFirst.mockImplementation(async ({ where, select }) => {
    const item = items.get(where.id);
    if (!item || (where.isActive === true && !item.isActive)) return null;
    return select ? Object.fromEntries(Object.keys(select).map(key => [key, item[key]])) : item;
  });
  prisma.contributor.findUnique.mockImplementation(async ({ where, include }) => where.id !== CONTRIBUTOR ? null
    : { id: CONTRIBUTOR, fullName: 'Fixture Author', itemContributors: links(include.itemContributors.where) });
  prisma.contributor.count.mockResolvedValue(1);
  prisma.contributor.findMany.mockImplementation(async ({ include }) => [{ id: CONTRIBUTOR, fullName: 'Fixture Author',
    _count: { itemContributors: include._count.select.itemContributors === true ? 2
      : links(include._count.select.itemContributors.where).length } }]);
});

describe('item contributor visibility matches item details', () => {
  it.each(['STUDENT', 'LIBRARIAN', 'MANAGEMENT'])('preserves ordinary active-item access for %s without permission grants', async role => {
    const response = await get(`${itemPath(ACTIVE)}/contributors`, role).expect(200);
    expect(response.body.data).toMatchObject({ id: ACTIVE, isActive: true });
    expect(prisma.libraryItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ACTIVE, isActive: true } }));
  });

  it.each(['STUDENT', 'LIBRARIAN', 'MANAGEMENT'])('uses the same missing/archived default response for %s', async role => {
    const archived = await get(`${itemPath(ARCHIVED)}/contributors`, role).expect(404);
    const absent = await get(`${itemPath(MISSING)}/contributors`, role).expect(404);
    expect(archived.body.error).toEqual(absent.body.error);
    expect(archived.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Library item not found' });
    expect(JSON.stringify(archived.body)).not.toContain('Archived');
  });

  it.each(['LIBRARIAN', 'MANAGEMENT'])('preserves authorized archived-item reads for %s with explicit opt-in', async role => {
    const response = await get(`${itemPath(ARCHIVED)}/contributors`, role, { includeInactive: 'true' }).expect(200);
    expect(response.body.data).toMatchObject({ id: ARCHIVED, isActive: false, title: items.get(ARCHIVED).title });
    expect(prisma.libraryItem.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: ARCHIVED } }));
  });

  it.each([ACTIVE, ARCHIVED, MISSING])('denies Student inactive opt-in before looking up %s', async id => {
    const response = await get(`${itemPath(id)}/contributors`, 'STUDENT', { includeInactive: 'true' }).expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(prisma.libraryItem.findFirst).not.toHaveBeenCalled();
  });

  it('defaults the service to active records even without an HTTP caller', async () => {
    await expect(listItemContributors(ARCHIVED)).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect((await listItemContributors(ACTIVE)).id).toBe(ACTIVE);
  });

  it.each(['BOOK', 'PROJECT', 'THESIS', 'ACADEMIC_WORK'])('keeps %s typed metadata on the protected main item-read path', async type => {
    for (const item of items.values()) {
      item.type = type;
      item.academicWorkDetails = type === 'BOOK' ? null : { workType: type, academicYear: '2026' };
    }
    await get(itemPath(ACTIVE)).expect(200);
    await get(itemPath(ARCHIVED)).expect(404);
    await get(itemPath(ARCHIVED), 'STUDENT', { includeInactive: 'true' }).expect(403);
    const staff = await get(itemPath(ARCHIVED), 'LIBRARIAN', { includeInactive: 'true' }).expect(200);
    expect(staff.body.data.type).toBe(type);
  });
});

describe('equivalent contributor-to-item reads and counts', () => {
  it.each(['STUDENT', 'LIBRARIAN', 'MANAGEMENT'])('hides archived linked metadata and counts by default for %s', async role => {
    const response = await get(personPath, role).expect(200);
    expect(response.body.data.itemContributors.map(link => link.item.id)).toEqual([ACTIVE]);
    expect(JSON.stringify(response.body)).not.toContain(items.get(ARCHIVED).title);
    const list = await get('/api/v1/catalog/contributors', role).expect(200);
    expect(list.body.data[0]._count.itemContributors).toBe(1);
    expect(list.body.pagination.total).toBe(1); // contributors, not catalog items
    expect(prisma.contributor.findUnique.mock.calls[0][0].include.itemContributors.where).toEqual({ item: { isActive: true } });
    expect(prisma.contributor.findMany.mock.calls[0][0].include._count.select.itemContributors).toEqual({ where: { item: { isActive: true } } });
  });

  it.each(['LIBRARIAN', 'MANAGEMENT'])('allows %s to opt into archived associations and truthful full counts', async role => {
    const response = await get(personPath, role, { includeInactive: 'true' }).expect(200);
    expect(response.body.data.itemContributors).toHaveLength(2);
    const list = await get('/api/v1/catalog/contributors', role, { includeInactive: 'true' }).expect(200);
    expect(list.body.data[0]._count.itemContributors).toBe(2);
  });

  it('retains contributor identity records without exposing their archived-only item links', async () => {
    items.delete(ACTIVE);
    const response = await get(personPath).expect(200);
    expect(response.body.data.itemContributors).toEqual([]);
    expect(response.body.data.fullName).toBe('Fixture Author');
    expect((await get('/api/v1/catalog/contributors')).body.data[0]._count.itemContributors).toBe(0);
  });

  it('applies safe defaults for internal contributor reads too', async () => {
    expect((await getContributor(CONTRIBUTOR)).itemContributors).toHaveLength(1);
    expect((await listContributors({})).data[0]._count.itemContributors).toBe(1);
  });
});

describe('authentication, query validation and existing role guards', () => {
  const paths = [`${itemPath(ARCHIVED)}/contributors`, itemPath(ARCHIVED), personPath, '/api/v1/catalog/contributors'];
  it.each(paths)('requires authentication before read access at %s', async path => {
    await request(app).get(path).expect(401);
    expect(prisma.libraryItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.contributor.findUnique).not.toHaveBeenCalled();
    expect(prisma.contributor.findMany).not.toHaveBeenCalled();
  });
  it.each(paths)('denies unauthorized inactive opt-in without resource lookup at %s', async path => {
    await get(path, 'STUDENT', { includeInactive: 'true' }).expect(403);
    expect(prisma.libraryItem.findFirst).not.toHaveBeenCalled();
    expect(prisma.contributor.findUnique).not.toHaveBeenCalled();
    expect(prisma.contributor.findMany).not.toHaveBeenCalled();
  });
  it.each(paths)('rejects malformed visibility options at %s', async path => {
    await get(path, 'LIBRARIAN', { includeInactive: 'yes' }).expect(400);
  });
  it.each(['STUDENT', 'MANAGEMENT'])('keeps %s excluded from Librarian-only contributor writes', async role => {
    await request(app).put(`${itemPath(ACTIVE)}/contributors`).set('Authorization', `Bearer ${issueAccessToken(users.get(role))}`)
      .send({ version: 1, contributors: [] }).expect(403);
    expect(prisma.libraryItem.findFirst).not.toHaveBeenCalled();
  });
});
