$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (
  Join-Path $PSScriptRoot "..\.."
)

Write-Host "========================================"
Write-Host "SAMS Sprint 9G2 Final Functional Regression"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Frontend role/route contracts..."
Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9g2-ui-contract-smoke.js"
  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 9G2 frontend role contract smoke failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "2) Live API functional regression..."
Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9g2-functional-regression.js"
  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 9G2 live functional regression failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "3) Frontend production build..."
Push-Location $projectRoot
try {
  & npm run build -w @sams/web
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend production build failed."
  }
}
finally {
  Pop-Location
}

Write-Host "Frontend production build: OK"
Write-Host ""
Write-Host "Sprint 9G2 final functional regression PASSED."
