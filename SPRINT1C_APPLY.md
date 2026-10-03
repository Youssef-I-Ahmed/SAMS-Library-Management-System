# SAMS Sprint 1C — Students Import / Sync

Adds:

- `GET /api/v1/students`
- `GET /api/v1/students/:studentId`
- `POST /api/v1/students/import`

Permissions:

- STUDENT: cannot browse all students.
- LIBRARIAN: read + import/sync.
- MANAGEMENT: read-only.

Sync rules:

- New `studentId` creates User + Student.
- Existing `studentId` updates the linked record.
- STUDENT role is attached automatically.
- Faculty/department must already exist.
- Department must belong to the supplied faculty.
- Duplicate email conflicts are rejected.
- A batch runs inside one DB transaction.

No migration or new npm package is required.

Apply patch over project root, then run:

```powershell
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1c-students-smoke.ps1
```

Expected:

```text
Sprint 1C smoke test PASSED.
```

CSV example:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\import-students-csv.ps1 -Path .\data\templates\students-import-template.csv
```

Do not import real university data until fields/access have been confirmed.
