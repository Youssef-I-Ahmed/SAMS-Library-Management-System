$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (
  Join-Path $PSScriptRoot "..\.."
)

Write-Host "========================================"
Write-Host "SAMS Sprint 9G3 UI/UX + A11y Polish"
Write-Host "========================================"
Write-Host ""

Write-Host "1) UI/UX accessibility contracts..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9g3-polish-contract-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 9G3 UI/UX contract smoke failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "2) Re-run final functional regression..."

Push-Location $projectRoot
try {
  & node ".\scripts\sprint9\sprint9g2-functional-regression.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Post-polish functional regression failed."
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
Write-Host "Sprint 9G3 UI/UX + accessibility polish PASSED."
