$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (
  Join-Path $PSScriptRoot "..\.."
)

Write-Host "========================================"
Write-Host "SAMS Sprint 9C Student Discovery Smoke"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Frontend discovery contracts..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9c-discovery-contract-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Frontend discovery contract smoke failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "2) Live student discovery API..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9c-live-discovery-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Live student discovery smoke failed."
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
Write-Host "Sprint 9C student discovery smoke PASSED."
