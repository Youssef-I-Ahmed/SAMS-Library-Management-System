$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

Write-Host "1) Student login..."
$student = DevLogin "student@sams.dev"
$studentHeaders = @{ Authorization = "Bearer $($student.accessToken)" }

Write-Host "2) Student can READ categories and Dewey..."
$categories = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog-master/categories" `
  -Headers $studentHeaders

$dewey = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog-master/dewey" `
  -Headers $studentHeaders

Write-Host "Categories:" $categories.data.Count
Write-Host "Dewey classifications:" $dewey.data.Count

Write-Host "3) Student cannot CREATE category..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/catalog-master/categories" `
    -Headers $studentHeaders `
    -ContentType "application/json" `
    -Body (@{ name = "SHOULD NOT CREATE" } | ConvertTo-Json)

  throw "RBAC TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "RBAC OK: Student received 403."
  } else { throw }
}

Write-Host "4) Librarian login..."
$librarian = DevLogin "librarian@sams.dev"
$headers = @{ Authorization = "Bearer $($librarian.accessToken)" }
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "5) Create category..."
$category = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog-master/categories" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    name = "Sprint1D Category $suffix"
    description = "Smoke test category"
  } | ConvertTo-Json)

Write-Host "Created category:" $category.data.name

Write-Host "6) Create top-level Dewey..."
$rootCode = "DEV-$suffix"
$rootDewey = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog-master/dewey" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    code = $rootCode
    name = "Sprint1D Root Classification"
  } | ConvertTo-Json)

Write-Host "Created Dewey:" $rootDewey.data.code

Write-Host "7) Create child Dewey..."
$childDewey = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog-master/dewey" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    code = "$rootCode.1"
    name = "Sprint1D Child Classification"
    parentId = $rootDewey.data.id
  } | ConvertTo-Json)

Write-Host "Child parent:" $childDewey.data.parent.code

Write-Host "8) Search Dewey..."
$search = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog-master/dewey?search=$rootCode" `
  -Headers $headers

if ($search.data.Count -lt 2) {
  throw "Dewey search test failed"
}

Write-Host "Search matches:" $search.data.Count

Write-Host "9) Verify hierarchy-cycle protection..."
try {
  Invoke-RestMethod `
    -Method Patch `
    -Uri "http://localhost:4000/api/v1/catalog-master/dewey/$($rootDewey.data.id)" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      parentId = $childDewey.data.id
    } | ConvertTo-Json)

  throw "CYCLE TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Hierarchy protection OK: cycle rejected."
  } else { throw }
}

Write-Host ""
Write-Host "Sprint 1D smoke test PASSED."
