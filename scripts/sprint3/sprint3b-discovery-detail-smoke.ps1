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

Write-Host "3) Create contributor..."
$contributor = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/contributors" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    fullName = "Sprint3B Detail Author $suffix"
  } | ConvertTo-Json)

Write-Host "4) Create BOOK..."
$book = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint3B Distributed Systems $suffix"
    deweyCodeRaw = "004.36"
    callNumber = "004.36 / S3B-$suffix"
    language = "English"
    publicationYear = 2026
    abstract = "Sprint 3B student item-detail smoke test"
  } | ConvertTo-Json)

Write-Host "5) Add BookDetails..."
$withBookDetails = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/book-details" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $book.data.version
    isbn = "978-S3B-$suffix"
    publisher = "Sprint3B Press"
    edition = "2nd"
  } | ConvertTo-Json)

Write-Host "6) Add contributor..."
$withContributor = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/contributors" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $withBookDetails.data.version
    contributors = @(
      @{
        contributorId = $contributor.data.id
        role = "AUTHOR"
      }
    )
  } | ConvertTo-Json -Depth 5)

Write-Host "7) Add AVAILABLE + UNAVAILABLE copies..."
$availableCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $book.data.id
    branchId = $mainBranch.id
    copyCode = "S3B-$suffix-A"
    barcode = "S3B-BAR-$suffix-A"
    shelfLocation = "Private Shelf A"
    status = "AVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

$unavailableCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $book.data.id
    branchId = $mainBranch.id
    copyCode = "S3B-$suffix-U"
    barcode = "S3B-BAR-$suffix-U"
    shelfLocation = "Private Shelf U"
    status = "UNAVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "8) Student reads discovery detail..."
$detail = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items/$($book.data.id)" `
  -Headers $studentHeaders

if ($detail.data.id -ne $book.data.id) {
  throw "Wrong discovery detail item"
}

if ($detail.data.bookDetails.publisher -ne "Sprint3B Press") {
  throw "BookDetails missing from discovery detail"
}

if ($detail.data.itemContributors.Count -ne 1) {
  throw "Contributor data missing from discovery detail"
}

if ($detail.data.itemContributors[0].contributor.fullName -ne $contributor.data.fullName) {
  throw "Contributor name mismatch"
}

Write-Host "Related metadata: OK"

Write-Host "9) Validate full availability..."
if ($detail.data.availability.totalCopies -ne 2) {
  throw "Expected totalCopies=2"
}

if ($detail.data.availability.availableCopies -ne 1) {
  throw "Expected availableCopies=1"
}

if (-not $detail.data.availability.available) {
  throw "Expected item availability=true"
}

if ($detail.data.availability.branches.Count -ne 1) {
  throw "Expected one branch availability entry"
}

Write-Host "Availability counts: OK"

Write-Host "10) Validate reservation-ready branch selection..."
if (-not $detail.data.reservationReadiness.hasAvailableCopy) {
  throw "Expected reservationReadiness.hasAvailableCopy=true"
}

if ($detail.data.reservationReadiness.candidateBranches.Count -ne 1) {
  throw "Expected exactly one reservation candidate branch"
}

if ($detail.data.reservationReadiness.candidateBranches[0].branch.code -ne "MAIN") {
  throw "Expected MAIN as reservation candidate branch"
}

if ($detail.data.reservationReadiness.candidateBranches[0].availableCopies -ne 1) {
  throw "Expected one available copy in candidate branch"
}

Write-Host "Reservation candidate branch: OK"

Write-Host "11) Ensure no raw PhysicalCopy data leaks..."
$json = $detail | ConvertTo-Json -Depth 30

$forbiddenValues = @(
  $availableCopy.data.id,
  $unavailableCopy.data.id,
  "S3B-BAR-$suffix-A",
  "S3B-BAR-$suffix-U",
  "S3B-$suffix-A",
  "S3B-$suffix-U",
  "Private Shelf A",
  "Private Shelf U"
)

foreach ($value in $forbiddenValues) {
  if ($json -match [regex]::Escape($value)) {
    throw "Discovery detail leaked raw inventory value: $value"
  }
}

Write-Host "Raw inventory privacy boundary: OK"

Write-Host "12) Remove last AVAILABLE copy from availability..."
$updatedCopy = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($availableCopy.data.id)" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $availableCopy.data.version
    status = "UNAVAILABLE"
  } | ConvertTo-Json)

$noAvailability = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items/$($book.data.id)" `
  -Headers $studentHeaders

if ($noAvailability.data.availability.availableCopies -ne 0) {
  throw "Expected no available copies"
}

if ($noAvailability.data.reservationReadiness.hasAvailableCopy) {
  throw "Reservation readiness should be false with no available copies"
}

if ($noAvailability.data.reservationReadiness.candidateBranches.Count -ne 0) {
  throw "Candidate branches should be empty"
}

Write-Host "No-availability detail state: OK"

Write-Host "13) Archive item and ensure student detail returns 404..."
$archived = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $withContributor.data.version
    isActive = $false
  } | ConvertTo-Json)

try {
  Invoke-RestMethod `
    -Method Get `
    -Uri "http://localhost:4000/api/v1/discovery/items/$($book.data.id)" `
    -Headers $studentHeaders

  throw "Archived item detail should not be visible"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 404) {
    Write-Host "Archived item detail visibility: OK"
  } else {
    throw
  }
}

Write-Host ""
Write-Host "Sprint 3B discovery detail smoke PASSED."
