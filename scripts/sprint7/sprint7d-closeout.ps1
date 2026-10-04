$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 7 Migration Pilot Closeout"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Build immutable-style evidence manifest..."
& node `
  (Join-Path $PSScriptRoot "sprint7d-build-evidence-manifest.js")

if ($LASTEXITCODE -ne 0) {
  throw "Sprint 7 evidence manifest generation failed."
}

Write-Host ""
Write-Host "2) Verify evidence hashes + clean application DB..."
& node `
  (Join-Path $PSScriptRoot "sprint7-verify-clean-state.js")

if ($LASTEXITCODE -ne 0) {
  throw "Sprint 7 closeout verification failed."
}

Write-Host ""
Write-Host "Sprint 7 migration pilot closeout PASSED."
