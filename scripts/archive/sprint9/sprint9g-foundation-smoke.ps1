$ErrorActionPreference = "Stop"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

Write-Host "========================================"
Write-Host "SAMS Sprint 9G Foundation Smoke"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Student ownership + lazy-route contracts..."
Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9g-foundation-contract-smoke.js"
  if ($LASTEXITCODE -ne 0) { throw "Sprint 9G foundation contract smoke failed." }
}
finally { Pop-Location }

Write-Host ""
Write-Host "2) Frontend production build..."
Push-Location $projectRoot
try {
  & npm run build -w @sams/web
  if ($LASTEXITCODE -ne 0) { throw "Frontend production build failed." }
}
finally { Pop-Location }

Write-Host ""
Write-Host "Sprint 9G foundation smoke PASSED."
Write-Host "Review the Vite chunk list above; page routes should now be split across multiple JS chunks."
