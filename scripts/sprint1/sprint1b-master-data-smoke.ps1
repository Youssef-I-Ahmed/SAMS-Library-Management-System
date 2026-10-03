$ErrorActionPreference = "Stop"

function DevLogin($email) {
  $body = @{ universityEmail = $email } | ConvertTo-Json

  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body $body
}

Write-Host "1) Login as Student..."
$studentLogin = DevLogin "student@sams.dev"
$studentHeaders = @{
  Authorization = "Bearer $($studentLogin.accessToken)"
}

Write-Host "2) Student can READ faculties..."
$faculties = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/master-data/faculties" `
  -Headers $studentHeaders

Write-Host "Faculty count:" $faculties.data.Count

Write-Host "3) Student must NOT CREATE faculty..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/master-data/faculties" `
    -Headers $studentHeaders `
    -ContentType "application/json" `
    -Body (@{ name = "SHOULD NOT BE CREATED" } | ConvertTo-Json)

  throw "RBAC TEST FAILED: Student unexpectedly created faculty."
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "RBAC OK: Student received 403."
  } else {
    throw
  }
}

Write-Host "4) Login as Librarian..."
$librarianLogin = DevLogin "librarian@sams.dev"
$librarianHeaders = @{
  Authorization = "Bearer $($librarianLogin.accessToken)"
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$facultyName = "Sprint1B Faculty $suffix"

Write-Host "5) Librarian creates faculty..."
$newFaculty = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/master-data/faculties" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{ name = $facultyName } | ConvertTo-Json)

Write-Host "Created faculty:" $newFaculty.data.name

Write-Host "6) Librarian creates department..."
$newDepartment = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/master-data/departments" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    facultyId = $newFaculty.data.id
    name = "Sprint1B Department"
  } | ConvertTo-Json)

Write-Host "Created department:" $newDepartment.data.name

Write-Host "7) Librarian creates branch..."
$branchCode = "T$suffix"

$newBranch = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/master-data/branches" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    code = $branchCode
    name = "Sprint1B Branch $suffix"
    location = "Smoke Test"
  } | ConvertTo-Json)

Write-Host "Created branch:" $newBranch.data.code "-" $newBranch.data.name
Write-Host "Branch version:" $newBranch.data.version

Write-Host "8) Optimistic-lock update..."
$updatedBranch = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/master-data/branches/$($newBranch.data.id)" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    version = $newBranch.data.version
    location = "Updated by Sprint1B smoke test"
  } | ConvertTo-Json)

Write-Host "Updated branch version:" $updatedBranch.data.version

Write-Host ""
Write-Host "Sprint 1B smoke test PASSED."
