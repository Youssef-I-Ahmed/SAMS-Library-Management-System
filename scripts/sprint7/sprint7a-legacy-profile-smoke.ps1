$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 7A Legacy Profiling Smoke"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Profile raw legacy CSV sources..."
& node `
  (Join-Path $PSScriptRoot "sprint7a-profile-legacy-sources.js")

if ($LASTEXITCODE -ne 0) {
  throw "Legacy profiling failed."
}

Write-Host ""
Write-Host "2) Verify known source integrity + staging..."
& node `
  (Join-Path $PSScriptRoot "sprint7a-verify-profile.js")

if ($LASTEXITCODE -ne 0) {
  throw "Legacy profile verification failed."
}

Write-Host ""
Write-Host "Sprint 7A legacy source profiling smoke PASSED."
