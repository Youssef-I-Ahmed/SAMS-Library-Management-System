$ErrorActionPreference = "Stop"

$projectRoot =
  Resolve-Path (
    Join-Path `
      $PSScriptRoot `
      "..\.."
  )

Write-Host "========================================"
Write-Host "SAMS Sprint 9B Auth + Role Shells Smoke"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Frontend auth/role contracts..."

Push-Location $projectRoot

try {
  & node `
    ".\scripts\sprint9\sprint9b-auth-contract-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Frontend auth contract smoke failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "2) Backend development-auth integration..."

Push-Location $projectRoot

try {
  & node `
    ".\scripts\sprint9\sprint9b-live-auth-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Live development-auth integration smoke failed."
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
Write-Host "Sprint 9B authentication + role shells smoke PASSED."
