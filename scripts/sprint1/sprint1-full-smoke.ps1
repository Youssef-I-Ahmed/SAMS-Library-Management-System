$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 1 Full Integration Smoke Test"
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
  ".\scripts\sprint1-auth-smoke.ps1",
  ".\scripts\sprint1b-master-data-smoke.ps1",
  ".\scripts\sprint1c-students-smoke.ps1",
  ".\scripts\sprint1d-catalog-master-smoke.ps1"
)

foreach ($test in $tests) {
  if (-not (Test-Path $test)) {
    throw "Required smoke test not found: $test"
  }

  Write-Host ""
  Write-Host "----------------------------------------"
  Write-Host "Running $test"
  Write-Host "----------------------------------------"

  & powershell -ExecutionPolicy Bypass -File $test

  if ($LASTEXITCODE -ne 0) {
    throw "Smoke test failed: $test"
  }
}

Write-Host ""
Write-Host "========================================"
Write-Host "Sprint 1 FULL integration smoke PASSED."
Write-Host "========================================"
