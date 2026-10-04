$ErrorActionPreference = "Stop"

function Run-PowerShellScript(
  [string]$Label,
  [string]$Path
) {
  if (-not (Test-Path $Path)) {
    throw "Missing required RC script: $Path"
  }

  Write-Host ""
  Write-Host "----------------------------------------"
  Write-Host $Label
  Write-Host "----------------------------------------"

  & powershell `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $Path

  if ($LASTEXITCODE -ne 0) {
    throw "RC regression failed: $Label"
  }
}

function Run-NodeScript(
  [string]$Label,
  [string]$Path
) {
  if (-not (Test-Path $Path)) {
    throw "Missing required RC script: $Path"
  }

  Write-Host ""
  Write-Host "----------------------------------------"
  Write-Host $Label
  Write-Host "----------------------------------------"

  & node $Path

  if ($LASTEXITCODE -ne 0) {
    throw "RC regression failed: $Label"
  }
}

Write-Host "========================================"
Write-Host "SAMS MVP Release Candidate Full Regression"
Write-Host "========================================"
Write-Host ""

Write-Host "0) Vitest suite..."
& npm test

if ($LASTEXITCODE -ne 0) {
  throw "npm test failed."
}

Run-PowerShellScript `
  "Sprint 1 full smoke" `
  ".\scripts\sprint1\sprint1-full-smoke.ps1"

Run-NodeScript `
  "Sprint 1 smoke cleanup" `
  ".\scripts\sprint1\cleanup-sprint1-smoke-data.js"

Run-PowerShellScript `
  "Sprint 1 persistent seed verification" `
  ".\scripts\sprint1\sprint1-verify-dev-data.ps1"

Run-PowerShellScript `
  "Sprint 2 full smoke" `
  ".\scripts\sprint2\sprint2-full-smoke.ps1"

Run-NodeScript `
  "Sprint 2 smoke cleanup" `
  ".\scripts\sprint2\cleanup-sprint2-smoke-data.js"

Run-NodeScript `
  "Sprint 2 clean-state verification" `
  ".\scripts\sprint2\sprint2-verify-clean-state.js"

Run-PowerShellScript `
  "Sprint 3 full smoke" `
  ".\scripts\sprint3\sprint3-full-smoke.ps1"

Run-NodeScript `
  "Sprint 3 smoke cleanup" `
  ".\scripts\sprint3\cleanup-sprint3-smoke-data.js"

Run-NodeScript `
  "Sprint 3 clean-state verification" `
  ".\scripts\sprint3\sprint3-verify-clean-state.js"

Run-PowerShellScript `
  "Sprint 4 full smoke" `
  ".\scripts\sprint4\sprint4-full-smoke.ps1"

Run-NodeScript `
  "Sprint 4 smoke cleanup" `
  ".\scripts\sprint4\cleanup-sprint4-smoke-data.js"

Run-NodeScript `
  "Sprint 4 clean-state verification" `
  ".\scripts\sprint4\sprint4-verify-clean-state.js"

Run-PowerShellScript `
  "Sprint 5 full smoke" `
  ".\scripts\sprint5\sprint5-full-smoke.ps1"

Run-NodeScript `
  "Sprint 5 smoke cleanup" `
  ".\scripts\sprint5\cleanup-sprint5-smoke-data.js"

Run-NodeScript `
  "Sprint 5 clean-state verification" `
  ".\scripts\sprint5\sprint5-verify-clean-state.js"

Run-PowerShellScript `
  "Sprint 6 full smoke" `
  ".\scripts\sprint6\sprint6-full-smoke.ps1"

Run-NodeScript `
  "Sprint 6 smoke cleanup" `
  ".\scripts\sprint6\cleanup-sprint6-smoke-data.js"

Run-NodeScript `
  "Sprint 6 clean-state verification" `
  ".\scripts\sprint6\sprint6-verify-clean-state.js"

Run-PowerShellScript `
  "Sprint 7 full migration-pilot smoke" `
  ".\scripts\sprint7\sprint7-full-smoke.ps1"

Run-PowerShellScript `
  "Sprint 7 evidence closeout" `
  ".\scripts\sprint7\sprint7d-closeout.ps1"

Run-PowerShellScript `
  "Sprint 8A security/runtime hardening" `
  ".\scripts\sprint8\sprint8a-security-runtime-smoke.ps1"

Run-PowerShellScript `
  "Sprint 8B runtime/DB verification" `
  ".\scripts\sprint8\sprint8b-runtime-db-smoke.ps1"

Write-Host ""
Write-Host "========================================"
Write-Host "SAMS MVP RC FULL regression PASSED."
Write-Host "========================================"
