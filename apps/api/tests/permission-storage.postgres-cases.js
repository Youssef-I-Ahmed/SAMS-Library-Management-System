// Registered only inside the existing opt-in, verified disposable Docker harness.
import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { loadPermissionPrincipalSnapshot, assertPermissionCatalogConsistency } from '../src/modules/authorization/permission-storage.js';

export function registerPermissionStorageTests({ getClient, sql, asyncSql, sqlSession, version, login, me, api, state, ID, OTHER }) {
  const data = (overrides = {}) => ({ userId: ID, grantedByUserId: OTHER, permissionKey: 'catalog.update',
    kind: 'USE', scope: 'GLOBAL', reason: 'Synthetic permission storage validation', ...overrides });
  const create = overrides => getClient().permissionGrant.create({ data: data(overrides) });
  const actors = () => sql(`INSERT INTO public.user_roles VALUES ('${ID}', 2), ('${OTHER}', 3);`);

  it('keeps storage empty and protection/bootstrap inactive, with complete catalog consistency', async () => {
    const db = getClient();
    expect(await db.permissionGrant.count()).toBe(0);
    expect(await db.user.count({ where: { isProtected: true } })).toBe(0);
    expect(await db.authorizationControl.findUnique({ where: { id: 1 } })).toMatchObject({ bootstrapCompleted: false });
    const rows = await db.$queryRaw`SELECT * FROM public.permission_catalog_snapshot()`;
    const [{ version: catalogVersion }] = await db.$queryRaw`SELECT public.permission_catalog_version() AS version`;
    expect(() => assertPermissionCatalogConsistency(rows, catalogVersion)).not.toThrow();
    expect(() => assertPermissionCatalogConsistency(rows.slice(1), catalogVersion)).toThrow();
    expect(() => assertPermissionCatalogConsistency(rows, catalogVersion + 1)).toThrow();
  });

  it('rejects unknown/wildcard keys, unsupported scopes/kinds and all Student master-import grants', async () => {
    for (const key of ['*', 'catalog.*', 'unknown.permission', 'students.master.import']) {
      await expect(create({ permissionKey: key })).rejects.toThrow();
    }
    await expect(create({ permissionKey: 'catalog.update', scope: 'BRANCH' })).rejects.toThrow();
    await expect(create({ permissionKey: 'staff.librarian.create', kind: 'DELEGATE' })).rejects.toThrow();
    expect(await getClient().permissionGrant.count()).toBe(0);
    expect(version()).toBe(1);
  });

  it('enforces scope shape, foreign keys, justification, non-self issuance and nullable-scope uniqueness', async () => {
    const db = getClient();
    const branch = await db.branch.create({ data: { code: 'QA-A', name: 'Synthetic A' } });
    await expect(create({ branchId: branch.id })).rejects.toThrow();
    await expect(create({ permissionKey: 'inventory.read', scope: 'BRANCH', branchId: null })).rejects.toThrow();
    await expect(create({ userId: randomUUID() })).rejects.toThrow();
    await expect(create({ grantedByUserId: randomUUID() })).rejects.toThrow();
    await expect(create({ grantedByUserId: ID })).rejects.toThrow();
    await expect(create({ reason: ' ' })).rejects.toThrow();
    const global = await create();
    expect(global).toMatchObject({ version: 1, scope: 'GLOBAL', branchId: null });
    await expect(create()).rejects.toMatchObject({ code: 'P2002' });
    const local = { permissionKey: 'inventory.read', scope: 'BRANCH', branchId: branch.id };
    await create(local); await expect(create(local)).rejects.toMatchObject({ code: 'P2002' });
    await expect(db.branch.delete({ where: { id: branch.id } })).rejects.toThrow();
    await expect(db.user.delete({ where: { id: OTHER } })).rejects.toThrow();
    await expect(db.permissionGrant.update({ where: { id: global.id }, data: { version: 0 } })).rejects.toThrow();
  });

  it('invalidates insertion, meaningful updates and deletion once; no-op changes leave JWTs valid', async () => {
    actors(); const before = version(); const token = await login();
    const grant = await create(); expect(version()).toBe(before + 1); await me(token).expect(401);
    const current = await login();
    await getClient().permissionGrant.update({ where: { id: grant.id, version: 1 }, data: { reason: grant.reason } });
    expect(version()).toBe(before + 1); await me(current).expect(200);
    const changed = await getClient().permissionGrant.update({ where: { id: grant.id, version: 1 }, data: { reason: 'Reviewed synthetic update' } });
    expect(changed.version).toBe(2); expect(version()).toBe(before + 2); await me(current).expect(401);
    await getClient().permissionGrant.delete({ where: { id: grant.id, version: 2 } });
    expect(version()).toBe(before + 3);
  });

  it('invalidates both principals when a grant moves and preserves active kind/scope identities', async () => {
    const db = getClient(); const third = await db.user.create({ data: { universityEmail: 'third@example.invalid', displayName: 'Synthetic Third' } });
    const grant = await create(); const firstBefore = version(), thirdBefore = version(third.id);
    await db.permissionGrant.update({ where: { id: grant.id, version: 1 }, data: { userId: third.id } });
    expect(version()).toBe(firstBefore + 1); expect(version(third.id)).toBe(thirdBefore + 1);
    await db.permissionGrant.delete({ where: { id: grant.id } });
    await db.user.delete({ where: { id: third.id } });
  });

  it('rolls back grant and authVersion changes together and rejects stale concurrent updates', async () => {
    const db = getClient(), before = version();
    await expect(db.$transaction(async tx => {
      await tx.permissionGrant.create({ data: data() }); throw new Error('Intentional disposable rollback');
    })).rejects.toThrow('Intentional disposable rollback');
    expect(await db.permissionGrant.count()).toBe(0); expect(version()).toBe(before);
    const grant = await create(); const v = version();
    const results = await Promise.allSettled([
      db.permissionGrant.update({ where: { id: grant.id, version: 1 }, data: { reason: 'Concurrent synthetic A' } }),
      db.permissionGrant.update({ where: { id: grant.id, version: 1 }, data: { reason: 'Concurrent synthetic B' } })
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await db.permissionGrant.findUnique({ where: { id: grant.id } })).version).toBe(2);
    expect(version()).toBe(v + 1);
  });

  it('loads roles, version and grants in a primary snapshot without authenticating or enforcing them', async () => {
    actors(); const db = getClient();
    const without = await loadPermissionPrincipalSnapshot(db, ID);
    expect(without.grants).toEqual([]); expect(without.principal).not.toHaveProperty('isAuthenticated');
    const token = await login(); await me(token).expect(200); // missing grants do not block runtime
    await create();
    const snapshot = await loadPermissionPrincipalSnapshot(db, ID);
    expect(snapshot.principal).toMatchObject({ authVersion: version(), roles: ['LIBRARIAN'], isProtected: false });
    expect(snapshot.grants).toEqual([{ userId: ID, permission: 'catalog.update', kind: 'USE', scope: { type: 'GLOBAL' } }]);
    await expect(loadPermissionPrincipalSnapshot({ $transaction: async () => { throw new Error('Synthetic private DB error'); } }, ID))
      .rejects.toMatchObject({ statusCode: 503, code: 'AUTHORIZATION_POLICY_UNAVAILABLE' });
  });

  it('keeps a concurrent permission write out of an earlier principal snapshot', async () => {
    actors(); const db = getClient(), before = version();
    let release, observed;
    const gate = new Promise(resolve => { release = resolve; });
    const started = new Promise(resolve => { observed = resolve; });
    const snapshotDb = { $transaction: (work, options) => db.$transaction(async tx => {
      await tx.$queryRaw`SELECT auth_version FROM public.users WHERE id = ${ID}::uuid`;
      observed(); await gate; return work(tx);
    }, { ...options, timeout: 15000 }) };
    const read = loadPermissionPrincipalSnapshot(snapshotDb, ID);
    await started; await create(); release();
    const snapshot = await read;
    expect(snapshot.principal.authVersion).toBe(before); expect(snapshot.grants).toEqual([]);
    expect(version()).toBe(before + 1);
  });

  it('rejects protected grant/protection/bootstrap activation without the absent maintenance prerequisite', async () => {
    const db = getClient();
    for (const permissionKey of ['permissions.protected.manage', 'security.events.read', 'system.admin', 'permissions.delegate']) {
      await expect(create({ permissionKey })).rejects.toThrow();
    }
    await expect(create({ kind: 'DELEGATE' })).rejects.toThrow();
    await expect(db.user.update({ where: { id: ID }, data: { isProtected: true } })).rejects.toThrow();
    await expect(db.authorizationControl.update({ where: { id: 1 }, data: { bootstrapCompleted: true } })).rejects.toThrow();
    expect((await db.authorizationControl.findUnique({ where: { id: 1 } })).bootstrapCompleted).toBe(false);
  });

  it('guards synthetic bootstrap, protected maintenance and the last active custodian under concurrent mutations', async () => {
    const firstBefore = version(), secondBefore = version(OTHER);
    // Database roles exist ONLY in this freshly owned test cluster. The migration
    // deliberately does not create or grant the operator prerequisite anywhere.
    sql(`CREATE ROLE sams_authorization_bootstrap_operator NOLOGIN;
      CREATE ROLE synthetic_ordinary_writer NOLOGIN;
      GRANT USAGE ON SCHEMA public TO synthetic_ordinary_writer;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO synthetic_ordinary_writer;
      BEGIN;
      INSERT INTO public.user_roles VALUES ('${ID}', 3), ('${OTHER}', 3);
      UPDATE public.users SET is_protected = true WHERE id IN ('${ID}', '${OTHER}');
      INSERT INTO public.permission_grants (id,user_id,permission_key,kind,scope,granted_by_user_id,reason) VALUES
        ('${randomUUID()}','${ID}','permissions.protected.manage','USE','GLOBAL','${OTHER}','Synthetic reviewed custodian A'),
        ('${randomUUID()}','${OTHER}','permissions.protected.manage','USE','GLOBAL','${ID}','Synthetic reviewed custodian B');
      UPDATE public.authorization_control SET bootstrap_completed = true WHERE id = 1;
      COMMIT;`);
    state.protectedBootstrapCompleted = true; // no reset/backdoor during cleanup
    expect((await getClient().authorizationControl.findUnique({ where: { id: 1 } })).bootstrapCompleted).toBe(true);
    // Membership, protection, root grant and bootstrap each advance once.
    expect(version()).toBe(firstBefore + 4); expect(version(OTHER)).toBe(secondBefore + 4);
    const revisionOnly = version();
    sql(`UPDATE public.authorization_control SET revision = revision + 1;
      UPDATE public.users SET is_protected = is_protected WHERE id = '${ID}';`);
    expect(version()).toBe(revisionOnly);
    // Valid storage keeps USE and DELEGATE separate, even for the same key/scope.
    await create({ permissionKey: 'inventory.read', kind: 'USE' });
    await create({ permissionKey: 'inventory.read', kind: 'DELEGATE' });
    expect(await getClient().permissionGrant.count({ where: { userId: ID, permissionKey: 'inventory.read' } })).toBe(2);
    const before = version();
    sql(`SET SESSION AUTHORIZATION synthetic_ordinary_writer;
      UPDATE public.users SET auth_version = auth_version + 1 WHERE id = '${ID}';`); // logout remains possible
    expect(version()).toBe(before + 1);
    expect(() => sql(`SET SESSION AUTHORIZATION synthetic_ordinary_writer;
      UPDATE public.users SET is_protected = false WHERE id = '${ID}';`)).toThrow();
    expect(() => sql(`SET SESSION AUTHORIZATION synthetic_ordinary_writer;
      INSERT INTO public.permission_grants (id,user_id,permission_key,kind,scope,granted_by_user_id,reason)
      VALUES ('${randomUUID()}','${ID}','system.admin','USE','GLOBAL','${OTHER}','Denied ordinary protected change');`)).toThrow();
    expect(() => sql('DELETE FROM public.authorization_control;')).toThrow();
    expect(() => sql('UPDATE public.authorization_control SET bootstrap_completed = false;')).toThrow();
    expect(() => sql('TRUNCATE public.permission_grants;')).toThrow();
    // Real concurrent connections: global state serialization permits one removal
    // and rolls back the second, even though each targets a different account.
    const results = await Promise.allSettled([
      asyncSql(`UPDATE public.users SET is_active = false WHERE id = '${ID}';`),
      asyncSql(`UPDATE public.users SET is_active = false WHERE id = '${OTHER}';`)
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const remaining = sql('SELECT id FROM public.users WHERE is_active AND is_protected;');
    for (const statement of [
      `UPDATE public.users SET is_protected = false WHERE id = '${remaining}';`,
      `DELETE FROM public.user_roles WHERE user_id = '${remaining}' AND role_id = 3;`,
      `DELETE FROM public.permission_grants WHERE user_id = '${remaining}' AND permission_key = 'permissions.protected.manage';`,
      "UPDATE public.roles SET name = 'NO_LONGER_MANAGEMENT' WHERE id = 3;"
    ]) expect(() => sql(statement)).toThrow();
    expect(sql('SELECT count(*) FROM public.users WHERE is_active AND is_protected;')).toBe('1');
    // Restore the other synthetic custodian normally; no invariant is disabled.
    sql('UPDATE public.users SET is_active = true WHERE NOT is_active;');
    // A writer with an older RepeatableRead snapshot must serialize/fail rather
    // than count the other custodian from before its committed deactivation.
    const older = sqlSession();
    try {
      older.write('BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT revision FROM public.authorization_control;');
      older.write('\\echo protected_snapshot_ready');
      await older.waitFor('protected_snapshot_ready');
      await asyncSql(`UPDATE public.users SET is_active = false WHERE id = '${ID}';`);
      older.end(`UPDATE public.users SET is_active = false WHERE id = '${OTHER}'; COMMIT;`);
      await expect(older.done).rejects.toThrow(/could not serialize access/i);
      expect(sql('SELECT count(*) FROM public.users WHERE is_active AND is_protected;')).toBe('1');
    } finally { older.end('ROLLBACK;'); }
    sql('UPDATE public.users SET is_active = true WHERE NOT is_active;');
  }, 90000);
}
