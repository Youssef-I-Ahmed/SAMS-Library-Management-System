$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 8B Runtime + DB Verification"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Read-only API regression..."
& node `
  (Join-Path $PSScriptRoot "sprint8b-readonly-regression.js")

if ($LASTEXITCODE -ne 0) {
  throw "Read-only API regression failed."
}

Write-Host ""
Write-Host "2) Isolated runtime lifecycle / graceful shutdown..."
& node `
  (Join-Path $PSScriptRoot "sprint8b-runtime-lifecycle-smoke.js")

if ($LASTEXITCODE -ne 0) {
  throw "Runtime lifecycle smoke failed."
}

Write-Host ""
Write-Host "3) PostgreSQL constraints/triggers/views contract..."
& node `
  (Join-Path $PSScriptRoot "sprint8b-db-contract-verify.js")

if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL contract verification failed."
}

Write-Host ""
Write-Host "Sprint 8B runtime + DB verification smoke PASSED."
