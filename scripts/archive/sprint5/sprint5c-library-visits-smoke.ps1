$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{
      universityEmail = $email
    } | ConvertTo-Json)
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Login as Librarian + Management + Student..."
$librarian = DevLogin "librarian@sams.dev"
$librarianHeaders = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

$management = DevLogin "management@sams.dev"
$managementHeaders = @{
  Authorization = "Bearer $($management.accessToken)"
}

$studentSeed = DevLogin "student@sams.dev"
$studentSeedHeaders = @{
  Authorization = "Bearer $($studentSeed.accessToken)"
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

Write-Host "3) Import two temporary ACTIVE students + one INACTIVE..."
$studentAId = "S5C-A-$suffix"
$studentBId = "S5C-B-$suffix"
$inactiveId = "S5C-I-$suffix"

$studentAEmail = "sprint5c-a-$suffix@sams.dev"
$studentBEmail = "sprint5c-b-$suffix@sams.dev"
$inactiveEmail = "sprint5c-inactive-$suffix@sams.dev"

$importBody = @{
  students = @(
    @{
      studentId = $studentAId
      universityEmail = $studentAEmail
      displayName = "Sprint5C Student A"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentBId
      universityEmail = $studentBEmail
      displayName = "Sprint5C Student B"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $inactiveId
      universityEmail = $inactiveEmail
      displayName = "Sprint5C Inactive"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "INACTIVE"
      isActive = $true
    }
  )
} | ConvertTo-Json -Depth 8

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/students/import" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body $importBody | Out-Null

Write-Host "Temporary students: OK"

Write-Host "4) Librarian manually checks Student A in..."
$visitA = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/check-in" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    studentNumber = $studentAId
    branchId = $mainBranch.id
    source = "MANUAL"
  } | ConvertTo-Json)

if (-not $visitA.data.isOpen) {
  throw "New visit should be open"
}

if ($visitA.data.source -ne "MANUAL") {
  throw "Visit source mismatch"
}

if ($visitA.data.student.studentId -ne $studentAId) {
  throw "Visit student mismatch"
}

if ($visitA.data.branch.id -ne $mainBranch.id) {
  throw "Visit branch mismatch"
}

Write-Host "Manual check-in: OK"

Write-Host "5) Duplicate open check-in must fail..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/visits/check-in" `
    -Headers $librarianHeaders `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $studentAId
      branchId = $mainBranch.id
      source = "QR"
    } | ConvertTo-Json)

  throw "Duplicate open visit should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "One-open-visit protection: OK"
  } else {
    throw
  }
}

Write-Host "6) Inactive academic-status student cannot check in..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/visits/check-in" `
    -Headers $librarianHeaders `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $inactiveId
      branchId = $mainBranch.id
      source = "MANUAL"
    } | ConvertTo-Json)

  throw "Inactive student check-in should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Visit eligibility protection: OK"
  } else {
    throw
  }
}

Write-Host "7) Student and Management cannot create visits..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/visits/check-in" `
    -Headers $studentSeedHeaders `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $studentBId
      branchId = $mainBranch.id
      source = "MANUAL"
    } | ConvertTo-Json)

  throw "Student visit mutation RBAC failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Student visit mutation RBAC: OK"
  } else {
    throw
  }
}

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/visits/check-in" `
    -Headers $managementHeaders `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $studentBId
      branchId = $mainBranch.id
      source = "MANUAL"
    } | ConvertTo-Json)

  throw "Management visit mutation RBAC failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Management visit mutation RBAC: OK"
  } else {
    throw
  }
}

Write-Host "8) Librarian / Management can read visit operations..."
$q = [uri]::EscapeDataString($studentAId)

$queue = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/visits?q=$q&openOnly=true" `
  -Headers $librarianHeaders

$currentA = $queue.data |
  Where-Object { $_.id -eq $visitA.data.id } |
  Select-Object -First 1

if (-not $currentA) {
  throw "Open visit missing from librarian queue"
}

if (-not $currentA.isOpen) {
  throw "Open visit queue state mismatch"
}

$managementQueue = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/visits?q=$q" `
  -Headers $managementHeaders

if (-not ($managementQueue.data | Where-Object { $_.id -eq $visitA.data.id })) {
  throw "Management read-only visit queue failed"
}

Write-Host "Visit operations queue: OK"

Write-Host "9) Librarian checks Student A out..."
$closedA = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/$($visitA.data.id)/check-out" `
  -Headers $librarianHeaders

if ($closedA.data.isOpen) {
  throw "Checked-out visit should be closed"
}

if (-not $closedA.data.checkedOutAt) {
  throw "checkedOutAt missing"
}

if (-not $closedA.data.checkoutBy) {
  throw "checkoutBy missing"
}

Write-Host "Visit check-out: OK"

Write-Host "10) Double check-out must fail..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/visits/$($visitA.data.id)/check-out" `
    -Headers $librarianHeaders

  throw "Double visit checkout should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Double checkout protection: OK"
  } else {
    throw
  }
}

Write-Host "11) Student A can check in again after closing old visit..."
$secondA = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/check-in" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    studentNumber = $studentAId
    branchId = $mainBranch.id
    source = "BARCODE"
  } | ConvertTo-Json)

if (-not $secondA.data.isOpen) {
  throw "Student should be able to start a new visit after checkout"
}

if ($secondA.data.source -ne "BARCODE") {
  throw "BARCODE source was not stored"
}

Write-Host "Re-entry after checkout: OK"

Write-Host "12) Close Student A second visit..."
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/$($secondA.data.id)/check-out" `
  -Headers $librarianHeaders | Out-Null

Write-Host "13) Run real concurrent check-in race for Student B..."
$concurrencyOutput = & node `
  .\scripts\sprint5\sprint5c-visit-concurrency-smoke.js `
  $librarian.accessToken `
  $studentBId `
  $mainBranch.id

if ($LASTEXITCODE -ne 0) {
  throw "Sprint 5C visit concurrency smoke failed"
}

$concurrencyOutput | ForEach-Object { Write-Host $_ }

$visitIdLine = $concurrencyOutput |
  Where-Object { $_ -like "VISIT_ID=*" } |
  Select-Object -Last 1

if (-not $visitIdLine) {
  throw "Concurrency smoke did not return visit id"
}

$studentBVisitId = $visitIdLine.Substring("VISIT_ID=".Length)

Write-Host "14) openOnly must show exactly the current Student B visit..."
$studentBQuery = [uri]::EscapeDataString($studentBId)

$openB = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/visits?q=$studentBQuery&openOnly=true" `
  -Headers $librarianHeaders

if ($openB.pagination.total -ne 1) {
  throw "Expected exactly one open Student B visit"
}

if ($openB.data[0].id -ne $studentBVisitId) {
  throw "Open Student B visit id mismatch"
}

Write-Host "Concurrent one-open-visit invariant: OK"

Write-Host "15) Close concurrency visit..."
Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/$studentBVisitId/check-out" `
  -Headers $librarianHeaders | Out-Null

Write-Host "16) Validate source filter + detail..."
$barcodeVisits = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/visits?studentNumber=$studentAId&source=BARCODE&pageSize=100" `
  -Headers $managementHeaders

if (-not ($barcodeVisits.data | Where-Object { $_.id -eq $secondA.data.id })) {
  throw "Visit source filter failed"
}

$detail = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/visits/$($visitA.data.id)" `
  -Headers $managementHeaders

if ($detail.data.student.studentId -ne $studentAId) {
  throw "Visit detail student mismatch"
}

if ($detail.data.isOpen) {
  throw "Closed visit detail should remain closed"
}

Write-Host "Visit filters + detail: OK"

Write-Host ""
Write-Host "Sprint 5C library visits smoke PASSED."
