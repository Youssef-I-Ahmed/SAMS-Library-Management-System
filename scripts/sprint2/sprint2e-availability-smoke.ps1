$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Login as Librarian + Student..."
$librarian = DevLogin "librarian@sams.dev"
$librarianHeaders = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

$student = DevLogin "student@sams.dev"
$studentHeaders = @{
  Authorization = "Bearer $($student.accessToken)"
}

Write-Host "2) Resolve MAIN branch..."
$branches = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/master-data/branches" `
  -Headers $librarianHeaders

$mainBranch = $branches.data |
  Where-Object { $_.code -eq "MAIN" } |
  Select-Object -First 1

if (-not $mainBranch) {
  throw "MAIN branch not found"
}

Write-Host "3) Create LibraryItem..."
$item = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint2E Availability Book $suffix"
  } | ConvertTo-Json)

Write-Host "4) Create AVAILABLE copy..."
$availableCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $item.data.id
    branchId = $mainBranch.id
    copyCode = "S2E-$suffix-A"
    barcode = "S2E-BAR-$suffix-A"
    status = "AVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "5) Create UNAVAILABLE copy..."
$unavailableCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $item.data.id
    branchId = $mainBranch.id
    copyCode = "S2E-$suffix-U"
    barcode = "S2E-BAR-$suffix-U"
    status = "UNAVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "6) Student reads aggregate availability..."
$availability = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($item.data.id)/availability" `
  -Headers $studentHeaders

Write-Host "Total copies:" $availability.data.totalCopies
Write-Host "Available copies:" $availability.data.availableCopies
Write-Host "Available:" $availability.data.available

if ($availability.data.totalCopies -ne 2) {
  throw "Expected totalCopies = 2"
}

if ($availability.data.availableCopies -ne 1) {
  throw "Expected availableCopies = 1"
}

if (-not $availability.data.available) {
  throw "Expected item to be available"
}

if ($availability.data.branches.Count -ne 1) {
  throw "Expected exactly one branch in availability"
}

if ($availability.data.branches[0].branch.code -ne "MAIN") {
  throw "Expected MAIN branch"
}

Write-Host "Branch aggregation: OK"

Write-Host "7) Make last AVAILABLE copy unavailable..."
$updated = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($availableCopy.data.id)" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $availableCopy.data.version
    status = "UNAVAILABLE"
  } | ConvertTo-Json)

Write-Host "Updated copy status:" $updated.data.status

Write-Host "8) Availability must now be false..."
$noneAvailable = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($item.data.id)/availability" `
  -Headers $studentHeaders

if ($noneAvailable.data.availableCopies -ne 0) {
  throw "Expected availableCopies = 0"
}

if ($noneAvailable.data.available) {
  throw "Expected availability=false"
}

Write-Host "No-availability state: OK"

Write-Host "9) Run DB concurrency smoke..."
$concurrencyScript = Join-Path $PSScriptRoot "sprint2e-concurrency-smoke.js"

if (-not (Test-Path $concurrencyScript)) {
  throw "Concurrency smoke script not found: $concurrencyScript"
}

& node $concurrencyScript

if ($LASTEXITCODE -ne 0) {
  throw "Sprint 2E concurrency smoke failed."
}

Write-Host ""
Write-Host "Sprint 2E availability smoke PASSED."
