$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

Write-Host "1) Student cannot list students..."
$student = DevLogin "student@sams.dev"
try {
  Invoke-RestMethod `
    -Method Get `
    -Uri "http://localhost:4000/api/v1/students" `
    -Headers @{ Authorization = "Bearer $($student.accessToken)" }

  throw "RBAC TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "RBAC OK: Student received 403."
  } else { throw }
}

Write-Host "2) Login as Librarian..."
$librarian = DevLogin "librarian@sams.dev"
$headers = @{ Authorization = "Bearer $($librarian.accessToken)" }

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$studentId = "SYNC-$suffix"
$email = "sync-$suffix@sams.dev"

Write-Host "3) Import new student..."
$body1 = @{
  students = @(
    @{
      studentId = $studentId
      universityEmail = $email
      displayName = "Sprint1C Student"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    }
  )
} | ConvertTo-Json -Depth 6

$r1 = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/students/import" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body1

Write-Host "Created:" $r1.data.created "- Updated:" $r1.data.updated

Write-Host "4) Import same student again as update..."
$body2 = @{
  students = @(
    @{
      studentId = $studentId
      universityEmail = $email
      displayName = "Sprint1C Student Updated"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "INACTIVE"
      isActive = $true
    }
  )
} | ConvertTo-Json -Depth 6

$r2 = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/students/import" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $body2

Write-Host "Created:" $r2.data.created "- Updated:" $r2.data.updated

Write-Host "5) Search student..."
$search = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/students?search=$studentId" `
  -Headers $headers

if ($search.pagination.total -ne 1) {
  throw "Search test failed"
}

Write-Host "Found:" $search.data[0].user.displayName
Write-Host "Status:" $search.data[0].academicStatus

Write-Host "6) Read detail..."
$detail = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/students/$studentId" `
  -Headers $headers

Write-Host "Roles:" ($detail.data.roles -join ", ")

if (-not ($detail.data.roles -contains "STUDENT")) {
  throw "STUDENT role missing"
}

Write-Host ""
Write-Host "Sprint 1C smoke test PASSED."
