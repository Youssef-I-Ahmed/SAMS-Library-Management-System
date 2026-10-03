# SAMS Scripts

Scripts are grouped by the sprint that introduced them.

```text
scripts/
├── sprint1/
├── sprint2/
└── sprint3/
```

Run commands from the repository root unless a command explicitly says otherwise.

## Sprint 1

Full regression smoke:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1\sprint1-full-smoke.ps1
```

Cleanup smoke data:

```powershell
node .\scripts\sprint1\cleanup-sprint1-smoke-data.js
```

Verify persistent development seed:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1\sprint1-verify-dev-data.ps1
```

Student CSV importer:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint1\import-students-csv.ps1 -Path .\data\templates\students-import-template.csv
```

## Sprint 2

Full regression smoke:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\sprint2\sprint2-full-smoke.ps1
```

Cleanup smoke data:

```powershell
node .\scripts\sprint2\cleanup-sprint2-smoke-data.js
```

Verify clean state + persistent Sprint 1 seed:

```powershell
node .\scripts\sprint2\sprint2-verify-clean-state.js
```

The full-smoke scripts resolve their child scripts through `$PSScriptRoot`, so moving the whole repository or running the command from a different current directory does not break sibling-script lookup.

The Sprint 1 cleanup and Sprint 2 database-backed JavaScript utilities explicitly load the project-root `.env`.
