$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (
  Join-Path $PSScriptRoot "..\.."
)

Write-Host "========================================"
Write-Host "SAMS Sprint 9E Librarian Operations Smoke"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Frontend staff-operation contracts..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9e-staff-contract-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Frontend staff-operation contract smoke failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "2) Live librarian operation APIs..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9e-live-operations-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Live librarian operation smoke failed."
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
Write-Host "Sprint 9E librarian operations smoke PASSED."
