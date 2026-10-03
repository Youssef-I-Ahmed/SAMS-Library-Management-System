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

Write-Host "3) Create Sprint3C category + Dewey..."
$category = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog-master/categories" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    name = "Sprint3C Category $suffix"
    description = "Discovery facet smoke category"
  } | ConvertTo-Json)

$dewey = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog-master/dewey" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    code = "S3C-$suffix"
    name = "Sprint3C Facet Classification"
  } | ConvertTo-Json)

Write-Host "4) Create BOOK + THESIS..."
$book = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint3C Facet Book $suffix"
    categoryId = $category.data.id
    deweyClassificationId = $dewey.data.id
    language = "English"
    publicationYear = 2026
  } | ConvertTo-Json)

$thesis = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "THESIS"
    title = "Sprint3C Facet Thesis $suffix"
    categoryId = $category.data.id
    deweyClassificationId = $dewey.data.id
    language = "Arabic"
    publicationYear = 2024
  } | ConvertTo-Json)

Write-Host "5) Add AVAILABLE book copy + UNAVAILABLE thesis copy..."
$bookCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $book.data.id
    branchId = $mainBranch.id
    copyCode = "S3C-$suffix-B"
    barcode = "S3C-BAR-$suffix-B"
    status = "AVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

$thesisCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $thesis.data.id
    branchId = $mainBranch.id
    copyCode = "S3C-$suffix-T"
    barcode = "S3C-BAR-$suffix-T"
    status = "UNAVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "6) Student reads discovery facets..."
$facets = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/facets" `
  -Headers $studentHeaders

$bookType = $facets.data.types |
  Where-Object { $_.value -eq "BOOK" } |
  Select-Object -First 1

$thesisType = $facets.data.types |
  Where-Object { $_.value -eq "THESIS" } |
  Select-Object -First 1

if (-not $bookType -or $bookType.count -lt 1) {
  throw "BOOK facet missing"
}

if (-not $thesisType -or $thesisType.count -lt 1) {
  throw "THESIS facet missing"
}

Write-Host "Type facets: OK"

Write-Host "7) Validate Category + Dewey facets..."
$categoryFacet = $facets.data.categories |
  Where-Object { $_.id -eq $category.data.id } |
  Select-Object -First 1

if (-not $categoryFacet -or $categoryFacet.count -lt 2) {
  throw "Current Sprint3C category facet missing or incorrect"
}

$deweyFacet = $facets.data.deweyClassifications |
  Where-Object { $_.id -eq $dewey.data.id } |
  Select-Object -First 1

if (-not $deweyFacet -or $deweyFacet.count -lt 2) {
  throw "Current Sprint3C Dewey facet missing or incorrect"
}

Write-Host "Category/Dewey facets: OK"

Write-Host "8) Validate Language + Year facets..."
$english = $facets.data.languages |
  Where-Object { $_.value -eq "English" } |
  Select-Object -First 1

$arabic = $facets.data.languages |
  Where-Object { $_.value -eq "Arabic" } |
  Select-Object -First 1

if (-not $english -or $english.count -lt 1) {
  throw "English language facet missing"
}

if (-not $arabic -or $arabic.count -lt 1) {
  throw "Arabic language facet missing"
}

$year2026 = $facets.data.publicationYears |
  Where-Object { $_.value -eq 2026 } |
  Select-Object -First 1

$year2024 = $facets.data.publicationYears |
  Where-Object { $_.value -eq 2024 } |
  Select-Object -First 1

if (-not $year2026 -or -not $year2024) {
  throw "Publication-year facets missing"
}

Write-Host "Language/year facets: OK"

Write-Host "9) Validate Branch + availability facet counts..."
$mainFacet = $facets.data.branches |
  Where-Object { $_.id -eq $mainBranch.id } |
  Select-Object -First 1

if (-not $mainFacet) {
  throw "MAIN branch facet missing"
}

if ($mainFacet.totalItems -lt 2) {
  throw "MAIN totalItems facet count is too low"
}

if ($mainFacet.availableItems -lt 1) {
  throw "MAIN availableItems facet count is too low"
}

$availableOnlyFacet = $facets.data.availabilityOptions |
  Where-Object { $_.value -eq "AVAILABLE_ONLY" } |
  Select-Object -First 1

if (-not $availableOnlyFacet -or $availableOnlyFacet.count -lt 1) {
  throw "AVAILABLE_ONLY facet missing"
}

Write-Host "Branch/availability facets: OK"

Write-Host "10) Validate sort/default UX metadata..."
$titleSort = $facets.data.sortOptions |
  Where-Object { $_.value -eq "TITLE_ASC" } |
  Select-Object -First 1

$yearSort = $facets.data.sortOptions |
  Where-Object { $_.value -eq "YEAR_DESC" } |
  Select-Object -First 1

if (-not $titleSort -or -not $yearSort) {
  throw "Sort options missing"
}

if ($facets.data.defaults.sort -ne "TITLE_ASC") {
  throw "Unexpected default sort"
}

if ($facets.data.defaults.pageSize -ne 20) {
  throw "Unexpected default page size"
}

Write-Host "Sort/default metadata: OK"

Write-Host "11) Validate search pagination metadata..."
$runQuery = [uri]::EscapeDataString("$suffix")

$page1 = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$runQuery&sort=YEAR_DESC&page=1&pageSize=1" `
  -Headers $studentHeaders

if ($page1.pagination.total -ne 2) {
  throw "Expected exactly 2 current-run discovery items"
}

if (-not $page1.pagination.hasNextPage) {
  throw "Expected hasNextPage=true"
}

if ($page1.pagination.hasPreviousPage) {
  throw "Expected hasPreviousPage=false"
}

if ($page1.data[0].id -ne $book.data.id) {
  throw "YEAR_DESC did not return the 2026 item first"
}

if ($page1.meta.query -ne "$suffix") {
  throw "Search meta.query mismatch"
}

if ($page1.meta.sort -ne "YEAR_DESC") {
  throw "Search meta.sort mismatch"
}

Write-Host "Search page-1 metadata: OK"

$page2 = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$runQuery&sort=YEAR_DESC&page=2&pageSize=1" `
  -Headers $studentHeaders

if (-not $page2.pagination.hasPreviousPage) {
  throw "Expected hasPreviousPage=true on page 2"
}

if ($page2.pagination.hasNextPage) {
  throw "Expected hasNextPage=false on final page"
}

if ($page2.data[0].id -ne $thesis.data.id) {
  throw "YEAR_DESC second page did not return the 2024 item"
}

Write-Host "Search page-2 metadata: OK"

Write-Host "12) Validate applied-filter metadata..."
$filtered = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/discovery/items?q=$runQuery&type=BOOK&branchId=$($mainBranch.id)&availableOnly=true" `
  -Headers $studentHeaders

if ($filtered.pagination.total -ne 1) {
  throw "Expected one current-run available BOOK"
}

if ($filtered.meta.appliedFilters.type -ne "BOOK") {
  throw "Applied type filter metadata mismatch"
}

if ($filtered.meta.appliedFilters.branchId -ne $mainBranch.id) {
  throw "Applied branch filter metadata mismatch"
}

if (-not $filtered.meta.appliedFilters.availableOnly) {
  throw "Applied availableOnly metadata mismatch"
}

Write-Host "Applied-filter metadata: OK"

Write-Host "13) Facets must not leak raw inventory..."
$facetsJson = $facets | ConvertTo-Json -Depth 30

$forbiddenValues = @(
  $bookCopy.data.id,
  $thesisCopy.data.id,
  "S3C-BAR-$suffix-B",
  "S3C-BAR-$suffix-T",
  "S3C-$suffix-B",
  "S3C-$suffix-T"
)

foreach ($value in $forbiddenValues) {
  if ($facetsJson -match [regex]::Escape($value)) {
    throw "Facets leaked raw inventory value: $value"
  }
}

Write-Host "Facet privacy boundary: OK"
Write-Host ""
Write-Host "Sprint 3C discovery facets smoke PASSED."
