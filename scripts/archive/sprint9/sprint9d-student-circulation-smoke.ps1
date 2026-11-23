$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (
  Join-Path $PSScriptRoot "..\.."
)

Write-Host "========================================"
Write-Host "SAMS Sprint 9D Student Circulation Smoke"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Frontend circulation contracts..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9d-circulation-contract-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Frontend circulation contract smoke failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "2) Live student circulation API..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9d-live-circulation-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Live student circulation smoke failed."
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
Write-Host "Sprint 9D student circulation smoke PASSED."
