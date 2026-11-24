import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/prisma.js', () => ({ prisma: { permissionGrant: { findMany: vi.fn() } } }));
const { prisma } = await import('../src/config/prisma.js');
const { requireGrant } = await import('../src/middleware/require-grant.js');
const { GROUP_IDS, groupsForKeys, keysForGroups } = await import('../src/modules/staff/staff-permissions.js');

const ID = '22222222-2222-4222-8222-222222222222';
const run = (roles, key) => new Promise((resolve) => {
  requireGrant(key)({ auth: { id: ID, roles } }, {}, (error) => resolve(error ?? null));
});

describe('librarian permissions', () => {
  it('turns groups into catalog keys and back', () => {
    expect(keysForGroups(['catalog.transfer'])).toEqual(['catalog.import', 'catalog.export']);
    expect(groupsForKeys(keysForGroups(GROUP_IDS))).toEqual(GROUP_IDS);
    expect(groupsForKeys(['catalog.import'])).toEqual([]);
  });

  it('lets Management through and checks librarians against their grants', async () => {
    expect(await run(['MANAGEMENT'], 'catalog.create')).toBeNull();
    prisma.permissionGrant.findMany.mockResolvedValueOnce([{ permissionKey: 'catalog.create' }]);
    expect(await run(['LIBRARIAN'], 'catalog.create')).toBeNull();
    prisma.permissionGrant.findMany.mockResolvedValueOnce([{ permissionKey: 'catalog.update' }]);
    expect((await run(['LIBRARIAN'], 'catalog.create')).code).toBe('PERMISSION_DENIED');
    prisma.permissionGrant.findMany.mockRejectedValueOnce(new Error('db down'));
    expect((await run(['LIBRARIAN'], 'catalog.create')).statusCode).toBe(503);
  });
});
