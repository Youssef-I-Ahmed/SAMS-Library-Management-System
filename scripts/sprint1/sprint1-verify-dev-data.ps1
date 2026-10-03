$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

Write-Host "Verifying persistent Sprint 1 development seed..."

$student = DevLogin "student@sams.dev"
$librarian = DevLogin "librarian@sams.dev"
$management = DevLogin "management@sams.dev"

if (-not ($student.user.roles -contains "STUDENT")) {
  throw "Dev student role is missing."
}

if (-not ($librarian.user.roles -contains "LIBRARIAN")) {
  throw "Dev librarian role is missing."
}

if (-not ($management.user.roles -contains "MANAGEMENT")) {
  throw "Dev management role is missing."
}

Write-Host "STUDENT role: OK"
Write-Host "LIBRARIAN role: OK"
Write-Host "MANAGEMENT role: OK"

$headers = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

$faculties = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/master-data/faculties" `
  -Headers $headers

$branches = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/master-data/branches" `
  -Headers $headers

$devFaculty = @($faculties.data | Where-Object { $_.name -eq "DEV Faculty" })
$mainBranch = @($branches.data | Where-Object { $_.code -eq "MAIN" })

if ($devFaculty.Count -ne 1) {
  throw "DEV Faculty missing or duplicated."
}

if ($mainBranch.Count -ne 1) {
  throw "MAIN branch missing or duplicated."
}

Write-Host "DEV Faculty: OK"
Write-Host "MAIN branch: OK"
Write-Host ""
Write-Host "Persistent Sprint 1 development seed verified."
