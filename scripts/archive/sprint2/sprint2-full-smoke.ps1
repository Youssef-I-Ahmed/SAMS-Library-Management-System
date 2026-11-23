$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 2 Full Integration Smoke Test"
Write-Host "========================================"
Write-Host ""

Write-Host "0) Health check..."
$health = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/health"

if ($health.status -ne "ok" -or $health.database -ne "connected") {
  throw "Health check failed."
}

Write-Host "API:" $health.status "- Database:" $health.database
Write-Host ""

$tests = @(
  (Join-Path $PSScriptRoot "sprint2a-library-items-smoke.ps1"),
  (Join-Path $PSScriptRoot "sprint2b-item-details-smoke.ps1"),
  (Join-Path $PSScriptRoot "sprint2c-contributors-smoke.ps1"),
  (Join-Path $PSScriptRoot "sprint2d-physical-copies-smoke.ps1"),
  (Join-Path $PSScriptRoot "sprint2e-availability-smoke.ps1")
)

foreach ($test in $tests) {
  if (-not (Test-Path $test)) {
    throw "Missing Sprint 2 smoke script: $test"
  }

  Write-Host "----------------------------------------"
  Write-Host "Running $(Split-Path $test -Leaf)"
  Write-Host "----------------------------------------"

  & powershell `
    -NoProfile `
    -ExecutionPolicy Bypass `
    -File $test

  if ($LASTEXITCODE -ne 0) {
    throw "Smoke test failed: $test"
  }

  Write-Host ""
}

Write-Host "========================================"
Write-Host "Sprint 2 FULL integration smoke PASSED."
Write-Host "========================================"
