$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (
  Join-Path $PSScriptRoot "..\.."
)

Write-Host "========================================"
Write-Host "SAMS Sprint 9G4 Final Closeout"
Write-Host "========================================"
Write-Host ""

Push-Location $projectRoot
try {
  Write-Host "1) Closeout contracts..."
  & node ".\scripts\sprint9\sprint9g4-closeout-contract-smoke.js"
  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 9G4 closeout contract smoke failed."
  }

  Write-Host ""
  Write-Host "2) Final live functional regression..."
  & node ".\scripts\sprint9\sprint9g2-functional-regression.js"
  if ($LASTEXITCODE -ne 0) {
    throw "Final live functional regression failed."
  }

  Write-Host ""
  Write-Host "3) UI/UX contract regression..."
  & node ".\scripts\sprint9\sprint9g3-polish-contract-smoke.js"
  if ($LASTEXITCODE -ne 0) {
    throw "Final UI/UX contract regression failed."
  }

  Write-Host ""
  Write-Host "4) Frontend production build..."
  & npm run build -w @sams/web
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend production build failed."
  }

  Write-Host ""
  Write-Host "5) Git whitespace check..."
  & git diff --check
  if ($LASTEXITCODE -ne 0) {
    throw "git diff --check failed."
  }

  Write-Host ""
  Write-Host "6) Current Git status..."
  & git status --short

  Write-Host ""
  Write-Host "Sprint 9G4 final closeout PASSED."
  Write-Host "Do NOT commit yet. Review the Git status before staging."
}
finally {
  Pop-Location
}
