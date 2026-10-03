# Sprint 0 Troubleshooting — 2026-10-03

## Observed failure chain

### 1. Docker command not found

Observed:

```text
docker : The term 'docker' is not recognized...
```

This is an environment/tooling issue, not an application-code issue. Docker Desktop / Docker CLI is not available in that PowerShell session.

Resolution:

- Install/start Docker Desktop and reopen PowerShell; or
- Use a locally installed PostgreSQL server and keep `DATABASE_URL` pointed at it.

### 2. Prisma P1012 on CirculationPolicy.branch

Observed:

```text
The relation field `branch` on model `CirculationPolicy` is missing an opposite relation field on the model `Branch`.
```

Root cause: Prisma relations are represented from both model sides. `CirculationPolicy` had `branch`, but `Branch` did not declare the reverse collection.

Fix applied:

```prisma
model Branch {
  // ...
  circulationPolicies CirculationPolicy[]
}
```

### 3. Seed fails with `@prisma/client did not initialize yet`

This was not an independent database/seed problem. `prisma generate` had failed because of P1012, so no generated Prisma Client existed yet.

Recovery order:

```powershell
npm run db:validate
npm run db:generate
# start PostgreSQL
npm run db:migrate -- --name init
npm run db:seed
```

### 4. Test fails at PrismaClient construction

Same dependency chain: the test imports the API app, the API imports Prisma Client, and Prisma Client was not generated because P1012 stopped generation. Once generation succeeds, the root-route unit/integration test can load the app.

### 5. ESM warning in `prisma/seed.js`

Fix applied: root `package.json` now contains:

```json
{
  "type": "module"
}
```

### 6. npm audit reports vulnerabilities

Do not run `npm audit fix --force` automatically. First run:

```powershell
npm audit
```

Review whether findings are production dependencies, development-only dependencies, and whether suggested upgrades are breaking. Resolve them deliberately after Sprint 0 can install/generate/test cleanly.

## Correct recovery sequence

```powershell
Copy-Item .env.example .env -ErrorAction SilentlyContinue
npm install
npm run db:validate
npm run db:generate

# Docker path only:
docker --version
docker compose up -d

npm run db:migrate -- --name init
npm run db:seed
npm test
```

Then start API and web in separate terminals.
