$ErrorActionPreference = "Stop"

function Run-NodeScript(
  [string]$Label,
  [string]$Path
) {
  Write-Host ""
  Write-Host "----------------------------------------"
  Write-Host $Label
  Write-Host "----------------------------------------"

  & node $Path

  if ($LASTEXITCODE -ne 0) {
    throw "MVP RC closeout failed: $Label"
  }
}

Write-Host "========================================"
Write-Host "SAMS MVP Release Candidate Closeout"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Re-verify final Sprint clean states..."

& node .\scripts\sprint2\sprint2-verify-clean-state.js
if ($LASTEXITCODE -ne 0) { throw "Sprint 2 clean verification failed." }

& node .\scripts\sprint3\sprint3-verify-clean-state.js
if ($LASTEXITCODE -ne 0) { throw "Sprint 3 clean verification failed." }

& node .\scripts\sprint4\sprint4-verify-clean-state.js
if ($LASTEXITCODE -ne 0) { throw "Sprint 4 clean verification failed." }

& node .\scripts\sprint5\sprint5-verify-clean-state.js
if ($LASTEXITCODE -ne 0) { throw "Sprint 5 clean verification failed." }

& node .\scripts\sprint6\sprint6-verify-clean-state.js
if ($LASTEXITCODE -ne 0) { throw "Sprint 6 clean verification failed." }

& node .\scripts\sprint7\sprint7-verify-clean-state.js
if ($LASTEXITCODE -ne 0) { throw "Sprint 7 clean verification failed." }

Write-Host ""
Write-Host "Final Sprint clean-state checks: OK"

Write-Host ""
Write-Host "2) PostgreSQL backup/restore verification..."

& powershell `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File .\scripts\sprint8\sprint8c-backup-restore-smoke.ps1

if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL backup/restore smoke failed."
}

Run-NodeScript `
  "3) Build MVP RC1 release manifest" `
  ".\scripts\sprint8\sprint8c-build-release-manifest.js"

Run-NodeScript `
  "4) Verify release manifest + final DB state" `
  ".\scripts\sprint8\sprint8c-verify-release-state.js"

Write-Host ""
Write-Host "========================================"
Write-Host "SAMS MVP RC1 CLOSEOUT PASSED."
Write-Host "========================================"
