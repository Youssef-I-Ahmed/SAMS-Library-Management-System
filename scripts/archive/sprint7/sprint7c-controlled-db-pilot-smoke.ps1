$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 7C Controlled DB Migration Pilot"
Write-Host "========================================"
Write-Host ""

$transformPath =
  Join-Path `
    (Resolve-Path (Join-Path $PSScriptRoot "..\..")) `
    "data\processed\legacy-pilot\transform\canonical-books.jsonl"

if (-not (Test-Path $transformPath)) {
  Write-Host "Sprint 7B transform output not found. Running Sprint 7B first..."

  & powershell `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File (Join-Path $PSScriptRoot "sprint7b-transform-dry-run-smoke.ps1")

  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 7B prerequisite failed."
  }
}

Write-Host "0) Cleanup any interrupted previous pilot..."
& node `
  (Join-Path $PSScriptRoot "sprint7c-controlled-db-pilot.js") `
  cleanup

if ($LASTEXITCODE -ne 0) {
  throw "Pre-pilot cleanup failed."
}

Write-Host ""
Write-Host "1) Build collision-aware DB pilot plan..."
& node `
  (Join-Path $PSScriptRoot "sprint7c-controlled-db-pilot.js") `
  plan

if ($LASTEXITCODE -ne 0) {
  throw "Pilot plan/preflight failed."
}

Write-Host ""
Write-Host "2) Import three-record controlled pilot..."
& node `
  (Join-Path $PSScriptRoot "sprint7c-controlled-db-pilot.js") `
  import

if ($LASTEXITCODE -ne 0) {
  throw "Controlled pilot import failed."
}

Write-Host ""
Write-Host "3) Verify imported rows and quarantine protections..."
& node `
  (Join-Path $PSScriptRoot "sprint7c-controlled-db-pilot.js") `
  verify

if ($LASTEXITCODE -ne 0) {
  throw "Controlled pilot verification failed."
}

Write-Host ""
Write-Host "4) Cleanup controlled pilot..."
& node `
  (Join-Path $PSScriptRoot "sprint7c-controlled-db-pilot.js") `
  cleanup

if ($LASTEXITCODE -ne 0) {
  throw "Controlled pilot cleanup failed."
}

Write-Host ""
Write-Host "5) Verify clean state..."
& node `
  (Join-Path $PSScriptRoot "sprint7c-controlled-db-pilot.js") `
  verify-clean

if ($LASTEXITCODE -ne 0) {
  throw "Controlled pilot clean-state verification failed."
}

Write-Host ""
Write-Host "Sprint 7C controlled DB migration pilot smoke PASSED."
