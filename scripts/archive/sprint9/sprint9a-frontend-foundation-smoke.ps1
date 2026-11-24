$ErrorActionPreference = "Stop"

$projectRoot =
  Resolve-Path (
    Join-Path `
      $PSScriptRoot `
      "..\.."
  )

$requiredFiles = @(
  "apps\web\src\app\providers\AppProviders.jsx",
  "apps\web\src\app\providers\ThemeProvider.jsx",
  "apps\web\src\app\providers\LanguageProvider.jsx",
  "apps\web\src\app\router\AppRouter.jsx",
  "apps\web\src\components\brand\BrandLogo.jsx",
  "apps\web\src\components\brand\brand-assets.js",
  "apps\web\src\components\ui\ThemeToggle.jsx",
  "apps\web\src\components\ui\LanguageSwitcher.jsx",
  "apps\web\src\features\foundation\FoundationPage.jsx",
  "apps\web\src\i18n\index.js",
  "apps\web\src\i18n\locales\en.js",
  "apps\web\src\i18n\locales\ar.js",
  "apps\web\src\styles\themes.css",
  "apps\web\src\styles\base.css",
  "apps\web\src\styles\layout.css",
  "apps\web\public\brand\sams-full-logo-navy.png",
  "apps\web\public\brand\sams-full-logo-white.png",
  "apps\web\public\brand\sams-logo-navy.png",
  "apps\web\public\brand\sams-logo-white.png"
)

Write-Host "========================================"
Write-Host "SAMS Sprint 9A Clean Frontend Foundation"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Required frontend foundation files..."

foreach (
  $relativePath in
  $requiredFiles
) {
  $fullPath =
    Join-Path `
      $projectRoot `
      $relativePath

  if (
    -not (
      Test-Path $fullPath
    )
  ) {
    throw "Missing required Sprint 9A file: $relativePath"
  }
}

Write-Host "Required files + SAMS brand assets: OK"

Write-Host ""
Write-Host "2) Language / theme / smart-brand contracts..."

Push-Location $projectRoot

try {
  & node `
    ".\scripts\sprint9\sprint9a-foundation-contract-smoke.js"

  if ($LASTEXITCODE -ne 0) {
    throw "Sprint 9A frontend contract smoke failed."
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "3) Production frontend build..."

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
Write-Host "4) Production build brand assets..."

$distAssets = @(
  "apps\web\dist\brand\sams-full-logo-navy.png",
  "apps\web\dist\brand\sams-full-logo-white.png",
  "apps\web\dist\brand\sams-logo-navy.png",
  "apps\web\dist\brand\sams-logo-white.png"
)

foreach (
  $relativePath in
  $distAssets
) {
  $fullPath =
    Join-Path `
      $projectRoot `
      $relativePath

  if (
    -not (
      Test-Path $fullPath
    )
  ) {
    throw "Production build is missing brand asset: $relativePath"
  }
}

Write-Host "Production brand assets: OK"

Write-Host ""
Write-Host "Sprint 9A clean frontend foundation smoke PASSED."
