$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Login as Student..."
$student = DevLogin "student@sams.dev"
$studentHeaders = @{
  Authorization = "Bearer $($student.accessToken)"
}

Write-Host "2) Student can search contributors..."
$publicList = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/contributors?search=Sprint2C" `
  -Headers $studentHeaders

Write-Host "Matches:" $publicList.pagination.total

Write-Host "3) Student cannot create contributor..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/catalog/contributors" `
    -Headers $studentHeaders `
    -ContentType "application/json" `
    -Body (@{ fullName = "SHOULD NOT CREATE" } | ConvertTo-Json)

  throw "RBAC TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "RBAC OK."
  } else { throw }
}

Write-Host "4) Login as Librarian..."
$librarian = DevLogin "librarian@sams.dev"
$headers = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

Write-Host "5) Create contributors..."
$author = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/contributors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ fullName = "Sprint2C Author $suffix" } | ConvertTo-Json)

$supervisor = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/contributors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ fullName = "Sprint2C Supervisor $suffix" } | ConvertTo-Json)

Write-Host "Author:" $author.data.fullName
Write-Host "Supervisor:" $supervisor.data.fullName

Write-Host "6) Create BOOK..."
$book = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint2C Book $suffix"
  } | ConvertTo-Json)

Write-Host "7) Replace BOOK contributor set..."
$bookContributors = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/contributors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    version = $book.data.version
    contributors = @(
      @{
        contributorId = $author.data.id
        role = "AUTHOR"
      }
    )
  } | ConvertTo-Json -Depth 5)

if ($bookContributors.data.itemContributors.Count -ne 1) {
  throw "Book contributor assignment failed"
}

Write-Host "Assigned role:" $bookContributors.data.itemContributors[0].role
Write-Host "New version:" $bookContributors.data.version

Write-Host "8) Stale contributor update must fail..."
try {
  Invoke-RestMethod `
    -Method Put `
    -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/contributors" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $book.data.version
      contributors = @()
    } | ConvertTo-Json -Depth 5)

  throw "OPTIMISTIC LOCK TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Optimistic locking OK."
  } else { throw }
}

Write-Host "9) Duplicate contributor-role pair must fail..."
try {
  Invoke-RestMethod `
    -Method Put `
    -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/contributors" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $bookContributors.data.version
      contributors = @(
        @{
          contributorId = $author.data.id
          role = "AUTHOR"
        },
        @{
          contributorId = $author.data.id
          role = "AUTHOR"
        }
      )
    } | ConvertTo-Json -Depth 5)

  throw "DUPLICATE VALIDATION FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 400) {
    Write-Host "Duplicate-pair validation OK."
  } else { throw }
}

Write-Host "10) Create THESIS..."
$thesis = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    type = "THESIS"
    title = "Sprint2C Thesis $suffix"
  } | ConvertTo-Json)

Write-Host "11) Assign researcher + supervisor..."
$thesisContributors = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($thesis.data.id)/contributors" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    version = $thesis.data.version
    contributors = @(
      @{
        contributorId = $author.data.id
        role = "RESEARCHER"
      },
      @{
        contributorId = $supervisor.data.id
        role = "SUPERVISOR"
      }
    )
  } | ConvertTo-Json -Depth 5)

if ($thesisContributors.data.itemContributors.Count -ne 2) {
  throw "Thesis contributor assignment failed"
}

Write-Host "Contributor count:" $thesisContributors.data.itemContributors.Count

Write-Host "12) Contributor name participates in catalog search..."
$searchName = [uri]::EscapeDataString("Sprint2C Author $suffix")
$itemSearch = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items?search=$searchName" `
  -Headers $studentHeaders

if ($itemSearch.pagination.total -lt 2) {
  throw "Contributor-name catalog search failed"
}

Write-Host "Items found through contributor name:" $itemSearch.pagination.total

Write-Host "13) Student reads item contributor list..."
$studentView = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($thesis.data.id)/contributors" `
  -Headers $studentHeaders

if ($studentView.data.itemContributors.Count -ne 2) {
  throw "Student contributor read failed"
}

Write-Host "Student contributor read: OK"
Write-Host ""
Write-Host "Sprint 2C smoke test PASSED."
