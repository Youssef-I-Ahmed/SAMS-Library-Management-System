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
    fullName = "Sprint3A Search Author $suffix"
  } | ConvertTo-Json)

Write-Host "4) Create searchable BOOK..."
$book = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint3A Cloud Architecture $suffix"
    callNumber = "004.6 / S3A-$suffix"
    language = "English"
    publicationYear = 2026
  } | ConvertTo-Json)

Write-Host "5) Add BookDetails..."
$bookWithDetails = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/book-details" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $book.data.version
    isbn = "978-S3A-$suffix"
    publisher = "Sprint3A Academic Press"
    edition = "1st"
  } | ConvertTo-Json)

Write-Host "6) Attach AUTHOR..."
$bookWithContributor = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/contributors" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $bookWithDetails.data.version
    contributors = @(
      @{
        contributorId = $contributor.data.id
        role = "AUTHOR"
      }
    )
  } | ConvertTo-Json -Depth 5)

Write-Host "7) Add one AVAILABLE copy..."
$copy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $book.data.id
    branchId = $mainBranch.id
    copyCode = "S3A-$suffix-A"
    barcode = "S3A-BAR-$suffix-A"
    shelfLocation = "Sprint3A Shelf"
    status = "AVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "8) Create second BOOK with no available copy..."
$unavailableBook = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint3A Cloud Security $suffix"
    language = "English"
    publicationYear = 2025
  } | ConvertTo-Json)

$unavailableCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $unavailableBook.data.id
    branchId = $mainBranch.id
    copyCode = "S3A-$suffix-U"
    barcode = "S3A-BAR-$suffix-U"
    status = "UNAVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "9) Student searches by title..."
$titleQuery = [uri]::EscapeDataString("Sprint3A Cloud Architecture $suffix")
$titleSearch = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$titleQuery" `
  -Headers $studentHeaders

if ($titleSearch.pagination.total -ne 1) {
  throw "Title discovery search failed"
}

if ($titleSearch.data[0].availability.availableCopies -ne 1) {
  throw "Search result availability aggregation failed"
}

Write-Host "Title search + availability: OK"

Write-Host "10) Student searches by contributor..."
$authorQuery = [uri]::EscapeDataString("Sprint3A Search Author $suffix")
$authorSearch = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$authorQuery" `
  -Headers $studentHeaders

if ($authorSearch.pagination.total -ne 1) {
  throw "Contributor discovery search failed"
}

Write-Host "Contributor search: OK"

Write-Host "11) Student searches by ISBN..."
$isbnQuery = [uri]::EscapeDataString("978-S3A-$suffix")
$isbnSearch = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$isbnQuery" `
  -Headers $studentHeaders

if ($isbnSearch.pagination.total -ne 1) {
  throw "ISBN discovery search failed"
}

Write-Host "ISBN search: OK"

Write-Host "12) availableOnly filter..."
$prefixQuery = [uri]::EscapeDataString("Sprint3A Cloud")
$availableSearch = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$prefixQuery&availableOnly=true&branchId=$($mainBranch.id)" `
  -Headers $studentHeaders

if ($availableSearch.pagination.total -lt 1) {
  throw "availableOnly filter should return at least the current available item"
}

$currentAvailable = $availableSearch.data |
  Where-Object { $_.id -eq $book.data.id } |
  Select-Object -First 1

if (-not $currentAvailable) {
  throw "availableOnly did not include the current available item"
}

if ($availableSearch.data | Where-Object { $_.id -eq $unavailableBook.data.id }) {
  throw "availableOnly incorrectly included the current unavailable item"
}

Write-Host "availableOnly + branch filter: OK"

Write-Host "13) Type + year filters..."
# Use this run's unique suffix so previous failed/rerun smoke data
# cannot change the expected total.
$runQuery = [uri]::EscapeDataString("$suffix")

$filtered = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$runQuery&type=BOOK&publicationYear=2026" `
  -Headers $studentHeaders

if ($filtered.pagination.total -ne 1) {
  throw "Type/year filtering failed. Expected 1 current-run item, got $($filtered.pagination.total)."
}

if ($filtered.data[0].id -ne $book.data.id) {
  throw "Type/year filtering returned the wrong current-run item"
}

Write-Host "Type/year filters: OK"

Write-Host "14) Student discovery response must not leak raw barcode/copy ID..."
$json = $titleSearch | ConvertTo-Json -Depth 20

if ($json -match [regex]::Escape("S3A-BAR-$suffix-A")) {
  throw "Discovery response leaked barcode"
}

if ($json -match [regex]::Escape($copy.data.id)) {
  throw "Discovery response leaked physical copy ID"
}

Write-Host "Raw inventory privacy boundary: OK"

Write-Host "15) Archive item and ensure discovery hides it..."
$archived = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $bookWithContributor.data.version
    isActive = $false
  } | ConvertTo-Json)

$afterArchive = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$titleQuery" `
  -Headers $studentHeaders

if ($afterArchive.pagination.total -ne 0) {
  throw "Archived item appeared in student discovery"
}

Write-Host "Archived item visibility: OK"
Write-Host ""
Write-Host "Sprint 3A discovery search smoke PASSED."
