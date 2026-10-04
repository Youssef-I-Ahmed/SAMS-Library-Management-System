$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 7 Full Migration Pilot Smoke"
Write-Host "========================================"
Write-Host ""

$tests = @(
  (Join-Path $PSScriptRoot "sprint7a-legacy-profile-smoke.ps1"),
  (Join-Path $PSScriptRoot "sprint7b-transform-dry-run-smoke.ps1"),
  (Join-Path $PSScriptRoot "sprint7c-controlled-db-pilot-smoke.ps1")
)

foreach ($test in $tests) {
  if (-not (Test-Path $test)) {
    throw "Missing Sprint 7 smoke script: $test"
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
Write-Host "Sprint 7 FULL migration pilot smoke PASSED."
Write-Host "========================================"
