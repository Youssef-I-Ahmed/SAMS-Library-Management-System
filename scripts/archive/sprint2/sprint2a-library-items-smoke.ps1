$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

Write-Host "1) Login as Student..."
$student = DevLogin "student@sams.dev"
$studentHeaders = @{ Authorization = "Bearer $($student.accessToken)" }

Write-Host "2) Student can list active library items..."
$studentList = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $studentHeaders

Write-Host "Current active items:" $studentList.pagination.total

Write-Host "3) Student cannot create a library item..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/catalog/items" `
    -Headers $studentHeaders `
    -ContentType "application/json" `
    -Body (@{
      type = "BOOK"
      title = "SHOULD NOT CREATE"
    } | ConvertTo-Json)

  throw "RBAC TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "RBAC OK: Student received 403."
  } else { throw }
}

Write-Host "4) Login as Librarian..."
$librarian = DevLogin "librarian@sams.dev"
$headers = @{ Authorization = "Bearer $($librarian.accessToken)" }
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "5) Create BOOK LibraryItem..."
$created = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint2A Database Systems $suffix"
    deweyCodeRaw = "004"
    callNumber = "004 / DEV-$suffix"
    language = "English"
    publicationYear = 2026
    abstract = "Sprint 2A smoke-test item"
  } | ConvertTo-Json)

Write-Host "Created item:" $created.data.title
Write-Host "Version:" $created.data.version

Write-Host "6) Search by title..."
$search = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items?search=Sprint2A%20Database%20Systems%20$suffix" `
  -Headers $headers

if ($search.pagination.total -ne 1) {
  throw "Search test failed"
}

Write-Host "Search found:" $search.data[0].title

Write-Host "7) Update with optimistic lock..."
$updated = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($created.data.id)" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    version = $created.data.version
    title = "Sprint2A Database Systems Updated $suffix"
  } | ConvertTo-Json)

Write-Host "Updated version:" $updated.data.version

Write-Host "8) Stale version must be rejected..."
try {
  Invoke-RestMethod `
    -Method Patch `
    -Uri "http://localhost:4000/api/v1/catalog/items/$($created.data.id)" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $created.data.version
      title = "STALE UPDATE"
    } | ConvertTo-Json)

  throw "OPTIMISTIC LOCK TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Optimistic locking OK: stale update rejected."
  } else { throw }
}

Write-Host "9) Archive item..."
$archived = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($created.data.id)" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    version = $updated.data.version
    isActive = $false
  } | ConvertTo-Json)

Write-Host "Archived:" (-not $archived.data.isActive)

Write-Host "10) Student must not see archived item..."
$studentSearch = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items?search=Sprint2A%20Database%20Systems%20Updated%20$suffix" `
  -Headers $studentHeaders

if ($studentSearch.pagination.total -ne 0) {
  throw "Archived visibility test failed"
}

Write-Host "Archived visibility: OK"
Write-Host ""
Write-Host "Sprint 2A smoke test PASSED."
