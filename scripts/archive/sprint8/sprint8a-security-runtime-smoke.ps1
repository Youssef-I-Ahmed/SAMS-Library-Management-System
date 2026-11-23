$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "SAMS Sprint 8A Security + Runtime Hardening"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Production environment safety guards..."
& node `
  (Join-Path $PSScriptRoot "sprint8a-production-env-guard-smoke.js")

if ($LASTEXITCODE -ne 0) {
  throw "Production environment guard smoke failed."
}

Write-Host ""
Write-Host "2) HTTP hardening..."
& node `
  (Join-Path $PSScriptRoot "sprint8a-http-hardening-smoke.js")

if ($LASTEXITCODE -ne 0) {
  throw "HTTP hardening smoke failed."
}

Write-Host ""
Write-Host "Sprint 8A security + runtime hardening smoke PASSED."
