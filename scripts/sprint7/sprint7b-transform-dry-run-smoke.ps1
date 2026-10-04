$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 7B Canonical Transform Dry Run"
Write-Host "========================================"
Write-Host ""

$manifestPath =
  Join-Path `
    (Resolve-Path (Join-Path $PSScriptRoot "..\..")) `
    "data\processed\legacy-pilot\source-manifest.json"

if (-not (Test-Path $manifestPath)) {
  Write-Host "Sprint 7A outputs not found. Running 7A profiling first..."

  & node `
    (Join-Path $PSScriptRoot "sprint7a-profile-legacy-sources.js")

  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 7A prerequisite profiling failed."
  }

  & node `
    (Join-Path $PSScriptRoot "sprint7a-verify-profile.js")

  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 7A prerequisite verification failed."
  }
}

Write-Host "1) Build canonical dry-run transform..."
& node `
  (Join-Path $PSScriptRoot "sprint7b-transform-books-dry-run.js")

if ($LASTEXITCODE -ne 0) {
  throw "Sprint 7B transform failed."
}

Write-Host ""
Write-Host "2) Verify transformed candidates + reconciliation..."
& node `
  (Join-Path $PSScriptRoot "sprint7b-verify-transform.js")

if ($LASTEXITCODE -ne 0) {
  throw "Sprint 7B transform verification failed."
}

Write-Host ""
Write-Host "Sprint 7B canonical transform dry-run smoke PASSED."
