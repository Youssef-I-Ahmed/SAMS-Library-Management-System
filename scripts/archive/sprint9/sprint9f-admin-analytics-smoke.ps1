$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Write-Host "========================================"
Write-Host "SAMS Sprint 9F Admin + Analytics Smoke"
Write-Host "========================================"
Write-Host ""
Write-Host "1) Frontend admin/analytics contracts..."
Push-Location $projectRoot
try { & node ".\scripts\sprint9\sprint9f-admin-contract-smoke.js"; if ($LASTEXITCODE -ne 0) { throw "Frontend 9F contract smoke failed." } } finally { Pop-Location }
Write-Host ""
Write-Host "2) Live admin + management APIs..."
Push-Location $projectRoot
try { & node ".\scripts\sprint9\sprint9f-live-admin-smoke.js"; if ($LASTEXITCODE -ne 0) { throw "Live 9F smoke failed." } } finally { Pop-Location }
Write-Host ""
Write-Host "3) Frontend production build..."
Push-Location $projectRoot
try { & npm run build -w @sams/web; if ($LASTEXITCODE -ne 0) { throw "Frontend production build failed." } } finally { Pop-Location }
Write-Host "Frontend production build: OK"
Write-Host ""
Write-Host "Sprint 9F admin + analytics smoke PASSED."
