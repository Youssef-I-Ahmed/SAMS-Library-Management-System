# SAMS Sprint 1 — Checkpoint 1A
## Development Authentication + RBAC Foundation

This patch intentionally does **not** modify:
- `prisma/schema.prisma`
- any migration
- `docker-compose.yml`
- `.env`

So your successful Sprint 0 database and `5433` Docker mapping remain untouched.

## 1. Snapshot Sprint 0 first

From your existing `dev` branch:

```powershell
git status
git add .
git commit -m "chore: complete Sprint 0 foundation"
git push origin dev
```

## 2. Copy this patch over the project root

Copy the included folders/files into:

```text
Y:\Digi\SAMS_Library_System_Root\SAMS_Library_System
```

Allow replacement for the listed API files and `prisma/seed.js`.

## 3. Install JWT dependency

```powershell
npm install jsonwebtoken -w @sams/api
```

## 4. Add auth environment variables

Generate a development secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Add the generated value to your `.env`:

```env
AUTH_TOKEN_SECRET="<paste-generated-secret-here>"
AUTH_TOKEN_EXPIRES_IN="8h"
DEV_AUTH_ENABLED="true"
```

Add safe placeholders to `.env.example`:

```env
AUTH_TOKEN_SECRET="replace-with-at-least-32-characters"
AUTH_TOKEN_EXPIRES_IN="8h"
DEV_AUTH_ENABLED="true"
```

Never commit the real `.env` secret.

## 5. Reseed development actors

```powershell
npm run db:seed
```

Expected dev accounts:
- `student@sams.dev`
- `librarian@sams.dev`
- `management@sams.dev`

No password is used because `/dev-login` is a **development-only adapter**.

## 6. Run existing tests

```powershell
npm test
```

## 7. Start API

```powershell
npm run dev:api
```

## 8. Smoke test authentication

Open a second PowerShell terminal:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1-auth-smoke.ps1
```

Expected:
- dev login returns an access token
- `/api/v1/auth/me` returns the student profile and `STUDENT` role

## Security rule

`/api/v1/auth/dev-login` automatically returns 404 in `NODE_ENV=production`.

This is temporary development authentication. University SSO later replaces the external identity verification step while the internal user/RBAC model stays the same.

## Next checkpoint

Sprint 1B:
- Faculties API
- Departments API
- Branches API
- protected RBAC routes
