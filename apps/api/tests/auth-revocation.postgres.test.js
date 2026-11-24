// OPT-IN ONLY: creates its own privately networked container from a cached image.
// Never consumes DATABASE_URL, .env, an existing container, or a host volume.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs';
import { fork, spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Only the parent's token helper uses this fixture config. The two real API child
// processes load unmocked auth modules with their own explicit synthetic env.
vi.mock('../src/config/env.js', () => ({ env: {
  NODE_ENV: 'test', DEV_AUTH_ENABLED: true, AUTH_TOKEN_EXPIRES_IN: '1h',
  AUTH_TOKEN_SECRET: 'disposable-pg-auth-test-signing-secret-not-a-real-credential'
} }));
import { env } from '../src/config/env.js';
import { verifyAccessToken } from '../src/modules/auth/token.service.js';
import { registerPermissionStorageTests } from './permission-storage.postgres-cases.js';

const enabled = process.env.SAMS_RUN_DISPOSABLE_AUTH_PG === '1';
const nonce = randomUUID().replaceAll('-', '');
const label = 'sams.auth-revocation.fixture';
const database = `sams_auth_disposable_${nonce}`;
const networkName = `sams-auth-network-${nonce}`;
const root = fileURLToPath(new URL('../../../', import.meta.url));
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
let container, network, workdir, client, connection, fixturePort;
const servers = [];
const permissionState = { protectedBootstrapCompleted: false };

function docker(args, input, timeout = 10000) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout, windowsHide: true });
  if (result.status !== 0) throw new Error(`Disposable Docker test failed: ${result.stderr || result.error?.message}`);
  return result.stdout.trim();
}
function assertOwned(cleanup = false) {
  if (!/^[a-f0-9]{64}$/.test(container ?? '')) throw new Error('No verified disposable container');
  const [info] = JSON.parse(docker(['inspect', container]));
  const [net] = JSON.parse(docker(['network', 'inspect', network]));
  const bindings = (info.State.Running ? info.NetworkSettings.Ports : info.HostConfig.PortBindings)?.['5432/tcp'] ?? [];
  const requested = info.HostConfig.PortBindings?.['5432/tcp'] ?? [];
  if (info.Config.Labels?.[label] !== nonce || info.HostConfig.NetworkMode !== networkName
    || info.Name !== `/sams-auth-test-${nonce}`
    || !Object.hasOwn(info.HostConfig.Tmpfs ?? {}, '/var/lib/postgresql/data')
    || info.Mounts.some(mount => mount.Type !== 'tmpfs')
    || requested.length !== 1 || requested[0].HostIp !== '127.0.0.1'
    || (!cleanup && (bindings.length !== 1 || bindings[0].HostIp !== '127.0.0.1'))
    || Object.keys(info.HostConfig.PortBindings ?? {}).length !== 1
    || net.Labels?.[label] !== nonce || net.Options?.['com.docker.network.bridge.enable_icc'] !== 'false'
    || Object.keys(net.Containers ?? {}).some(id => id !== container)) throw new Error('Unsafe database fixture isolation');
  return bindings[0]?.HostPort || fixturePort;
}
function args() {
  assertOwned();
  return ['exec', '-i', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', database];
}
function sql(statement) { return docker(args(), statement); }
function asyncSql(statement, onOutput) {
  const command = args();
  return new Promise((resolve, reject) => {
    const child = spawn('docker', command, { windowsHide: true });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; onOutput?.(stdout); });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
    child.stdin.end(statement);
  });
}
function sqlSession() {
  const child = spawn('docker', args(), { windowsHide: true });
  let stdout = '', stderr = '', closed = false;
  const watchers = new Set();
  const done = new Promise((resolveDone, reject) => {
    child.on('error', reject);
    // ON_ERROR_STOP can close stdin before Node sends EOF after the expected
    // serialization failure. Preserve SQL exit/stderr as the authoritative error.
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdout.on('data', data => {
      stdout += data;
      for (const watch of watchers) if (stdout.includes(watch.text)) watch.resolve();
    });
    child.stderr.on('data', data => { stderr += data; });
    child.on('close', code => {
      closed = true;
      for (const watch of watchers) watch.reject(new Error('SQL session closed before its synchronization marker'));
      code === 0 ? resolveDone(stdout.trim()) : reject(new Error(stderr));
    });
  });
  done.catch(() => {}); // attach assertions after the deliberate competing write
  return {
    done,
    write: statement => child.stdin.write(`${statement}\n`),
    end: statement => {
      if (!closed && !child.stdin.destroyed && !child.stdin.writableEnded) {
        if (statement === undefined) child.stdin.end(); else child.stdin.end(`${statement}\n`);
      }
    },
    waitFor: text => new Promise((resolveMarker, rejectMarker) => {
      if (stdout.includes(text)) return resolveMarker();
      if (closed) return rejectMarker(new Error('SQL session already closed'));
      const timer = setTimeout(() => watch.reject(new Error('SQL synchronization marker timed out')), 15000);
      const watch = { text,
        resolve: () => { clearTimeout(timer); watchers.delete(watch); resolveMarker(); },
        reject: error => { clearTimeout(timer); watchers.delete(watch); rejectMarker(error); } };
      watchers.add(watch);
    })
  };
}
const version = (id = ID) => Number(sql(`SELECT auth_version FROM public.users WHERE id = '${id}';`));

async function startApi(script, childEnv) {
  const child = fork(script, [], { cwd: workdir, env: childEnv, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true });
  const server = { child, port: null, logs: '' }; servers.push(server);
  child.stdout.on('data', data => { server.logs += data; });
  child.stderr.on('data', data => { server.logs += data; });
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('Disposable API did not become ready')), 15000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(`Disposable API exited before readiness: ${server.logs}`)); });
    child.once('message', message => {
      clearTimeout(timeout);
      if (!message?.port) return reject(new Error('Missing disposable API port'));
      server.port = message.port; resolveReady();
    });
  });
  return server;
}
const api = (index = 0) => request(`http://127.0.0.1:${servers[index].port}`);
const login = async (index = 0) => {
  const response = await api(index).post('/auth/dev-login').send({ universityEmail: 'one@example.invalid' }).expect(200);
  return response.body.accessToken;
};
const me = (token, index = 0) => api(index).get('/auth/me').set('Authorization', `Bearer ${token}`);

describe.skipIf(!enabled)('auth migration on a newly created disposable PostgreSQL container', () => {
  beforeAll(async () => {
    // --pull=never prevents downloading/installing an image. No configured DB is used.
    network = docker(['network', 'create', '--driver', 'bridge', '--opt', 'com.docker.network.bridge.enable_icc=false', '--label', `${label}=${nonce}`, networkName]);
    container = docker(['run', '--pull=never', '--detach', '--name', `sams-auth-test-${nonce}`,
      '--label', `${label}=${nonce}`, '--network', networkName, '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data',
      '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', `POSTGRES_DB=${database}`, 'postgres:16']);
    const port = assertOwned(); fixturePort = port;
    console.info('Disposable isolation verified: own labelled bridge, ICC disabled, tmpfs, localhost-only port, no existing database');
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      try { sql('SELECT 1;'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not become ready');
    if (sql('SELECT current_database();') !== database
      || sql("SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';") !== '0') {
      throw new Error('Disposable database identity/emptiness check failed');
    }
    const migrations = join(root, 'database/prisma/migrations');
    const names = readdirSync(migrations, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of names) {
      if (name.endsWith('_permission_storage')) {
        // Prove the additive migration preserves pre-existing synthetic identity
        // and role data, rather than testing only entirely empty tables.
        sql(`INSERT INTO public.users (id, university_email, display_name, updated_at)
          VALUES ('44444444-4444-4444-8444-444444444444','premigration@example.invalid','Pre-migration fixture',now());
          INSERT INTO public.roles (id,name) VALUES (99,'STUDENT');
          INSERT INTO public.user_roles VALUES ('44444444-4444-4444-8444-444444444444',99);`);
      }
      sql(readFileSync(join(migrations, name, 'migration.sql'), 'utf8'));
      if (name.endsWith('_permission_storage')) {
        expect(sql("SELECT auth_version::text || ':' || is_protected::text FROM public.users WHERE id = '44444444-4444-4444-8444-444444444444';")).toBe('2:false');
        expect(sql("SELECT role_record.name FROM public.user_roles AS membership JOIN public.roles AS role_record ON role_record.id = membership.role_id;")).toBe('STUDENT');
      }
    }
    sql(readFileSync(join(root, 'database/sql/postgres-extensions.sql'), 'utf8'));
    console.info(`Applied ${names.length} actual migration files and PostgreSQL extensions to disposable database`);

    connection = `postgresql://postgres@127.0.0.1:${port}/${database}?schema=public&connection_limit=3&connect_timeout=5`;
    workdir = mkdtempSync(join(tmpdir(), 'sams-auth-pg-client-'));
    writeFileSync(join(workdir, 'package.json'), JSON.stringify({ name: 'sams-auth-pg-fixture', private: true }));
    const generator = join(root, 'node_modules/@prisma/client/generator-build/index.js').replaceAll('\\', '/');
    const output = join(workdir, 'client').replaceAll('\\', '/');
    const schema = readFileSync(join(root, 'database/prisma/schema.prisma'), 'utf8')
      .replace('provider = "prisma-client-js"', `provider = "node ${generator}"\n  output = "${output}"`)
      .replace('env("DATABASE_URL")', JSON.stringify(connection));
    writeFileSync(join(workdir, 'schema.prisma'), schema);
    // Explicit non-secret environment allowlist; no application env file or URL.
    const childEnv = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'APPDATA', 'LOCALAPPDATA', 'USERPROFILE', 'COMSPEC']
      .filter(key => process.env[key]).map(key => [key, process.env[key]]));
    Object.assign(childEnv, { PRISMA_GENERATE_SKIP_AUTOINSTALL: '1', PRISMA_SKIP_POSTINSTALL_GENERATE: '1', CHECKPOINT_DISABLE: '1' });
    const generated = spawnSync(process.execPath, [join(root, 'node_modules/prisma/build/index.js'), 'generate', '--schema', join(workdir, 'schema.prisma')],
      { cwd: workdir, env: childEnv, encoding: 'utf8', timeout: 45000, windowsHide: true });
    if (generated.status !== 0) throw new Error(`Isolated client generation failed: ${generated.stderr || generated.stdout}`);
    const engine = join(root, 'node_modules/@prisma/engines/query_engine-windows.dll.node');
    // Use the installed engine, avoiding a mapped temporary DLL during cleanup.
    if (process.platform === 'win32') vi.stubEnv('PRISMA_QUERY_ENGINE_LIBRARY', engine);
    const { PrismaClient } = await import(/* @vite-ignore */ pathToFileURL(join(workdir, 'client/index.js')).href);
    client = new PrismaClient({ datasourceUrl: connection });
    await client.$connect();
    const identity = await client.$queryRaw`SELECT current_database() AS name`;
    expect(identity[0].name).toBe(database);
    const url = path => pathToFileURL(join(root, path)).href;
    const script = join(workdir, 'api-fixture.mjs');
    writeFileSync(script, `
      import express from ${JSON.stringify(url('node_modules/express/index.js'))};
      import { PrismaClient } from ${JSON.stringify(pathToFileURL(join(workdir, 'client/index.js')).href)};
      globalThis.__samsPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
      const { authRouter } = await import(${JSON.stringify(url('apps/api/src/modules/auth/auth.routes.js'))});
      const { studentsRouter } = await import(${JSON.stringify(url('apps/api/src/modules/students/students.routes.js'))});
      const { authenticate } = await import(${JSON.stringify(url('apps/api/src/middleware/authenticate.js'))});
      const { authorize } = await import(${JSON.stringify(url('apps/api/src/middleware/authorize.js'))});
      const { errorHandler } = await import(${JSON.stringify(url('apps/api/src/middleware/error-handler.js'))});
      const app = express(); app.use(express.json()); app.use('/auth', authRouter); app.use('/students', studentsRouter);
      app.get('/staff', authenticate, authorize('LIBRARIAN'), (_req, res) => res.sendStatus(204));
      app.use(errorHandler);
      const server = app.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
      process.on('message', async message => { if (message === 'stop') {
        await new Promise(resolve => server.close(resolve)); await globalThis.__samsPrisma.$disconnect(); process.exit(0);
      }});
    `);
    Object.assign(childEnv, { NODE_ENV: 'test', DEV_AUTH_ENABLED: 'true', AI_ENABLED: 'false', DATABASE_URL: connection,
      AUTH_TOKEN_SECRET: env.AUTH_TOKEN_SECRET, AUTH_TOKEN_EXPIRES_IN: '1h', DOTENV_CONFIG_PATH: join(workdir, '.no-env-file') });
    if (process.platform === 'win32') childEnv.PRISMA_QUERY_ENGINE_LIBRARY = engine;
    await startApi(script, childEnv); await startApi(script, childEnv);
    console.info('Temporary generated Prisma Client connected; two separate API processes use independent real database pools');
  }, 120000);

  afterAll(async () => {
    for (const server of servers) {
      if (server.child.exitCode === null && server.child.connected) {
        await new Promise(resolveExit => {
          const timeout = setTimeout(() => { server.child.kill(); resolveExit(); }, 5000);
          server.child.once('exit', () => { clearTimeout(timeout); resolveExit(); });
          server.child.send('stop');
        });
      }
    }
    await client?.$disconnect(); client = undefined;
    vi.unstubAllEnvs();
    if (container) {
      assertOwned(true); // Remove only this run's container, never a pre-existing DB.
      docker(['rm', '--force', '--volumes', container]); container = undefined;
    }
    if (network) {
      const [net] = JSON.parse(docker(['network', 'inspect', network]));
      if (net.Labels?.[label] !== nonce || Object.keys(net.Containers ?? {}).length) throw new Error('Unsafe network cleanup');
      docker(['network', 'rm', network]); network = undefined;
    }
    if (workdir) {
      if (dirname(resolve(workdir)) !== resolve(tmpdir()) || !workdir.includes('sams-auth-pg-client-')) throw new Error('Unsafe temporary client cleanup');
      rmSync(workdir, { recursive: true }); workdir = undefined;
    }
  });

  beforeEach(() => {
    if (permissionState.protectedBootstrapCompleted) return;
    sql(`DELETE FROM public.permission_grants; DELETE FROM public.branches;
      DELETE FROM public.students; DELETE FROM public.departments; DELETE FROM public.faculties;
      DELETE FROM public.user_roles; DELETE FROM public.users; DELETE FROM public.roles;
      INSERT INTO public.users (id, university_email, display_name, updated_at) VALUES
      ('${ID}', 'one@example.invalid', 'One', now()), ('${OTHER}', 'two@example.invalid', 'Two', now());
      INSERT INTO public.roles (id, name) VALUES (1, 'STUDENT'), (2, 'LIBRARIAN'), (3, 'MANAGEMENT');`);
  });

  it('defaults to one, blocks resets/decrements/non-positive values, and advances monotonically', () => {
    expect(version()).toBe(1);
    sql(`UPDATE public.users SET auth_version = auth_version + 1 WHERE id = '${ID}';`);
    expect(version()).toBe(2);
    for (const value of ['1', '0', '-1', 'NULL']) {
      expect(() => sql(`UPDATE public.users SET auth_version = ${value} WHERE id = '${ID}';`)).toThrow();
      expect(version()).toBe(2);
    }
    expect(() => sql(`INSERT INTO public.users (id, university_email, display_name, auth_version, updated_at)
      VALUES ('33333333-3333-4333-8333-333333333333', 'invalid@example.invalid', 'Invalid', 0, now());`)).toThrow();
  });

  it('invalidates activation and sensitive identity changes but ignores cosmetic/no-op updates', () => {
    sql(`UPDATE public.users SET display_name = 'Renamed', updated_at = now(), is_active = true WHERE id = '${ID}';`);
    expect(version()).toBe(1);
    sql(`UPDATE public.users SET is_active = false WHERE id = '${ID}';`); expect(version()).toBe(2);
    sql(`UPDATE public.users SET is_active = true WHERE id = '${ID}';`); expect(version()).toBe(3);
    sql(`UPDATE public.users SET university_email = 'changed@example.invalid', external_auth_id = 'fixture-subject' WHERE id = '${ID}';`);
    expect(version()).toBe(4);
    sql(`UPDATE public.users SET is_active = false, auth_version = auth_version + 1 WHERE id = '${ID}';`);
    expect(version()).toBe(5); // explicit increment + identity change does not double-count
  });

  it('deduplicates membership changes per statement and ignores unchanged membership sets', () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1), ('${ID}', 2);`);
    expect(version()).toBe(2); expect(version(OTHER)).toBe(1);
    sql(`UPDATE public.user_roles SET role_id = role_id;
      INSERT INTO public.user_roles VALUES ('${ID}', 1) ON CONFLICT DO NOTHING;`);
    expect(version()).toBe(2);
    sql('DELETE FROM public.user_roles;'); expect(version()).toBe(3);
  });

  it('invalidates both principals on membership reassignment', () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);
      UPDATE public.user_roles SET user_id = '${OTHER}' WHERE user_id = '${ID}';`);
    expect(version()).toBe(3); expect(version(OTHER)).toBe(2);
  });

  it('invalidates renamed assigned roles once per user without affecting unassigned/no-op names', () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1), ('${ID}', 2);
      UPDATE public.roles SET name = name || '_RENAMED' WHERE id IN (1, 2);`);
    expect(version()).toBe(3); expect(version(OTHER)).toBe(1);
    sql("UPDATE public.roles SET name = name; UPDATE public.roles SET name = 'UNASSIGNED' WHERE id = 3;");
    expect(version()).toBe(3);
  });

  it('rolls back revocation together with rolled-back account and membership mutations', () => {
    sql(`BEGIN; UPDATE public.users SET is_active = false WHERE id = '${ID}';
      INSERT INTO public.user_roles VALUES ('${ID}', 1); ROLLBACK;`);
    expect(version()).toBe(1);
    expect(sql(`SELECT is_active FROM public.users WHERE id = '${ID}';`)).toBe('t');
    expect(sql('SELECT count(*) FROM public.user_roles;')).toBe('0');
  });

  it('allows one conditional revocation to win across concurrent connections', async () => {
    const statement = `WITH changed AS (UPDATE public.users SET auth_version = auth_version + 1
      WHERE id = '${ID}' AND is_active AND auth_version = 1 RETURNING auth_version) SELECT count(*) FROM changed;`;
    const results = await Promise.all([asyncSql(statement), asyncSql(statement)]);
    expect(results.sort()).toEqual(['0', '1']); expect(version()).toBe(2);
  });

  it('keeps version and membership reads in one RepeatableRead snapshot', async () => {
    const gate = sqlSession(), reader = sqlSession();
    try {
      gate.write("BEGIN; SELECT pg_advisory_xact_lock(984320); SELECT 'GATE_READY';");
      await gate.waitFor('GATE_READY\n');
      reader.write(`BEGIN ISOLATION LEVEL REPEATABLE READ;
        SELECT auth_version FROM public.users WHERE id = '${ID}'; SELECT 'SNAPSHOT_READY';
        SELECT pg_advisory_xact_lock(984320);
        SELECT count(*) FROM public.user_roles WHERE user_id = '${ID}'; COMMIT;`);
      await reader.waitFor('SNAPSHOT_READY\n');
      sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);`);
      gate.end('COMMIT;'); await gate.done;
      reader.end();
      expect((await reader.done).split(/\r?\n/).filter(Boolean)).toEqual(['1', 'SNAPSHOT_READY', '0']);
      expect(version()).toBe(2);
    } finally { gate.end('ROLLBACK;'); reader.end('ROLLBACK;'); await Promise.allSettled([gate.done, reader.done]); }
  });

  it('does not let an old RepeatableRead role rename miss a newly introduced membership', async () => {
    const gate = sqlSession(), rename = sqlSession();
    try {
      gate.write("BEGIN; SELECT pg_advisory_xact_lock(984321); SELECT 'GATE_READY';");
      await gate.waitFor('GATE_READY\n');
      rename.write(`\\set VERBOSITY verbose
        BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT name FROM public.roles WHERE id = 1;
        SELECT 'SNAPSHOT_READY'; SELECT pg_advisory_xact_lock(984321);
        UPDATE public.roles SET name = 'RENAMED' WHERE id = 1; COMMIT;`);
      await rename.waitFor('SNAPSHOT_READY\n');
      sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);`);
      gate.end('COMMIT;'); await gate.done; rename.end();
      await expect(rename.done).rejects.toThrow('40001');
      expect(sql('SELECT name FROM public.roles WHERE id = 1;')).toBe('STUDENT');
      expect(version()).toBe(2);
    } finally { gate.end('ROLLBACK;'); rename.end('ROLLBACK;'); await Promise.allSettled([gate.done, rename.done]); }
  });

  it('preserves role-ID cascade relationships and invalidates their users', () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);
      UPDATE public.roles SET id = 4 WHERE id = 1;`);
    expect(sql(`SELECT role_id FROM public.user_roles WHERE user_id = '${ID}';`)).toBe('4');
    expect(version()).toBe(3);
  });

  it('uses the generated client with the complete schema and preserves Student/User relationships', async () => {
    const user = await client.user.findUnique({ where: { id: ID } });
    expect(user.authVersion).toBe(1);
    expect(await client.role.findMany({ orderBy: { id: 'asc' } })).toMatchObject([
      { name: 'STUDENT' }, { name: 'LIBRARIAN' }, { name: 'MANAGEMENT' }
    ]);
    const faculty = await client.faculty.create({ data: { name: 'Synthetic Faculty' } });
    const department = await client.department.create({ data: { name: 'Synthetic Department', facultyId: faculty.id } });
    await client.student.create({ data: { userId: ID, studentId: 'SYNTHETIC-001', facultyId: faculty.id, departmentId: department.id } });
    const student = await client.student.findUnique({ where: { studentId: 'SYNTHETIC-001' }, include: { user: true } });
    expect(student.user.id).toBe(ID);
    expect(await client.$queryRaw`SELECT count(*)::int AS count FROM sams_research.catalog`).toEqual([{ count: 0 }]);
    const guards = await client.$queryRaw`SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`;
    expect(guards.map(row => row.tgname)).toEqual(expect.arrayContaining(['trg_student_department_faculty', 'trg_borrowing_consistency', 'trg_users_auth_version']));
  });

  it('issues authoritative versioned JWTs and authenticates through two separate API processes', async () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);`);
    const token = await login();
    expect(verifyAccessToken(token).av).toBe((await client.user.findUnique({ where: { id: ID } })).authVersion);
    expect(servers[0].child.pid).not.toBe(servers[1].child.pid);
    await me(token).expect(200); await me(token, 1).expect(200);
    const legacy = jwt.sign({}, env.AUTH_TOKEN_SECRET, { subject: ID, issuer: 'sams-library-api', audience: 'sams-library-web', expiresIn: '1h' });
    await me(legacy).expect(401); await me(legacy, 1).expect(401);
  });

  it('does not revive old JWTs after real Prisma deactivation and reactivation', async () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);`);
    const token = await login(); const issued = verifyAccessToken(token).av;
    await client.user.update({ where: { id: ID }, data: { isActive: false } });
    await me(token).expect(401);
    await client.user.update({ where: { id: ID }, data: { isActive: true } });
    expect((await client.user.findUnique({ where: { id: ID } })).authVersion).toBe(issued + 2);
    await me(token).expect(401); await me(token, 1).expect(401);
    await me(await login(1)).expect(200);
  });

  it('revokes role changes and authorizes from current database roles, not JWT claims', async () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);`);
    let token = await login();
    await api().get('/staff').set('Authorization', `Bearer ${token}`).expect(403);
    await client.userRole.create({ data: { userId: ID, roleId: 2 } });
    await me(token).expect(401);
    token = await login(); await api(1).get('/staff').set('Authorization', `Bearer ${token}`).expect(204);
    await client.role.update({ where: { id: 2 }, data: { name: 'RENAMED_LIBRARIAN' } });
    await me(token, 1).expect(401);
    token = await login(); await api().get('/staff').set('Authorization', `Bearer ${token}`).expect(403);
    await client.userRole.delete({ where: { userId_roleId: { userId: ID, roleId: 2 } } });
    await me(token).expect(401);
    const user = await client.user.findUnique({ where: { id: ID } });
    const misleadingClaims = jwt.sign({ av: user.authVersion, roles: ['LIBRARIAN'] }, env.AUTH_TOKEN_SECRET,
      { subject: ID, issuer: 'sams-library-api', audience: 'sams-library-web', expiresIn: '1h' });
    await api().get('/staff').set('Authorization', `Bearer ${misleadingClaims}`).expect(403);
  });

  it('confirms account-wide logout after commit and rejects replay on both API processes', async () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);`);
    const first = await login(); const second = await login(1);
    const issued = verifyAccessToken(first).av;
    await api().post('/auth/logout-all').set('Authorization', `Bearer ${first}`).send({ userId: OTHER }).expect(400);
    expect(version()).toBe(issued);
    await api().post('/auth/logout-all').set('Authorization', `Bearer ${first}`).expect(204);
    expect((await client.user.findUnique({ where: { id: ID } })).authVersion).toBe(issued + 1);
    await me(first).expect(401); await me(second, 1).expect(401);
    await api(1).post('/auth/logout-all').set('Authorization', `Bearer ${first}`).expect(401);
    await me(await login(1)).expect(200);
  });

  it('keeps Student Import fail-closed for a real authenticated Librarian', async () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 2);`);
    const token = await login();
    const response = await api().post('/students/import').set('Authorization', `Bearer ${token}`).send({ students: [] }).expect(403);
    expect(response.body.error.code).toBe('STUDENT_IMPORT_NOT_CONFIGURED');
    expect(await client.student.count()).toBe(0);
  });

  registerPermissionStorageTests({ getClient: () => client, sql, asyncSql, sqlSession, version,
    login, me, api, state: permissionState, ID, OTHER });

  it('denies authentication safely when this disposable database actually becomes unavailable', async () => {
    sql(`INSERT INTO public.user_roles VALUES ('${ID}', 1);`);
    const token = await login(); await me(token).expect(200); await me(token, 1).expect(200);
    assertOwned(); docker(['stop', '--time', '3', container]); // our verified fixture only
    for (let index = 0; index < servers.length; index++) {
      const response = await me(token, index).expect(503);
      expect(response.body.error.code).toBe('AUTH_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toContain(connection);
      expect(servers[index].logs).not.toContain(token);
      expect(servers[index].logs).not.toContain(env.AUTH_TOKEN_SECRET);
    }
  }, 30000);
});
