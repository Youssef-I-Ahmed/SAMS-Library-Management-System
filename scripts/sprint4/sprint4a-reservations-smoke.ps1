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

Write-Host "1) Create temporary reservation policy fixture..."
$policyRaw = & node `
  .\scripts\sprint4\sprint4a-policy-fixture.js `
  create

if ($LASTEXITCODE -ne 0) {
  throw "Could not create policy fixture"
}

$policy = $policyRaw | ConvertFrom-Json
Write-Host "Policy hold hours:" $policy.reservationHoldHours

Write-Host "2) Login as Librarian + seeded Student..."
$librarian = DevLogin "librarian@sams.dev"
$librarianHeaders = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

$student = DevLogin "student@sams.dev"
$studentHeaders = @{
  Authorization = "Bearer $($student.accessToken)"
}

Write-Host "3) Resolve MAIN branch..."
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

Write-Host "4) Import second ACTIVE student + one INACTIVE student..."
$studentBEmail = "sprint4a-b-$suffix@sams.dev"
$studentBId = "S4A-B-$suffix"

$inactiveEmail = "sprint4a-inactive-$suffix@sams.dev"
$inactiveStudentId = "S4A-I-$suffix"

$importBody = @{
  students = @(
    @{
      studentId = $studentBId
      universityEmail = $studentBEmail
      displayName = "Sprint4A Student B"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $inactiveStudentId
      universityEmail = $inactiveEmail
      displayName = "Sprint4A Inactive Student"
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

$studentB = DevLogin $studentBEmail
$studentBHeaders = @{
  Authorization = "Bearer $($studentB.accessToken)"
}

$inactiveStudent = DevLogin $inactiveEmail
$inactiveHeaders = @{
  Authorization = "Bearer $($inactiveStudent.accessToken)"
}

Write-Host "5) Create reservable BOOK + AVAILABLE copy..."
$item = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint4A Reservation Book $suffix"
    callNumber = "S4A / $suffix"
  } | ConvertTo-Json)

$copy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $item.data.id
    branchId = $mainBranch.id
    copyCode = "S4A-$suffix-01"
    barcode = "S4A-BAR-$suffix-01"
    status = "AVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "6) Student creates reservation..."
$reservation = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations" `
  -Headers $studentHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $item.data.id
    branchId = $mainBranch.id
  } | ConvertTo-Json)

if ($reservation.data.status -ne "ACTIVE") {
  throw "Reservation should be ACTIVE"
}

if ($reservation.data.item.id -ne $item.data.id) {
  throw "Reservation item mismatch"
}

if ($reservation.data.branch.id -ne $mainBranch.id) {
  throw "Reservation branch mismatch"
}

if (
  [DateTimeOffset]::Parse($reservation.data.expiresAt) -le
  [DateTimeOffset]::Parse($reservation.data.reservedAt)
) {
  throw "Reservation expiry must be after reservedAt"
}

Write-Host "Reservation created:" $reservation.data.id
Write-Host "Reservation status:" $reservation.data.status

Write-Host "7) Reservation response must not expose allocated copy..."
$reservationJson = $reservation | ConvertTo-Json -Depth 20

if ($reservationJson -match [regex]::Escape($copy.data.id)) {
  throw "Reservation response leaked PhysicalCopy.id"
}

if ($reservationJson -match "allocatedCopyId") {
  throw "Reservation response leaked allocatedCopyId"
}

Write-Host "Reservation privacy boundary: OK"

Write-Host "8) Physical copy must now be RESERVED..."
$copyAfterReservation = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($copy.data.id)" `
  -Headers $librarianHeaders

if ($copyAfterReservation.data.status -ne "RESERVED") {
  throw "Allocated copy was not moved to RESERVED"
}

Write-Host "Copy transition AVAILABLE -> RESERVED: OK"

Write-Host "9) Student can list own reservations..."
$mine = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations/me?status=ACTIVE" `
  -Headers $studentHeaders

$currentReservation = $mine.data |
  Where-Object { $_.id -eq $reservation.data.id } |
  Select-Object -First 1

if (-not $currentReservation) {
  throw "Created reservation missing from /reservations/me"
}

Write-Host "My reservations: OK"

Write-Host "10) Duplicate active reservation must fail..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations" `
    -Headers $studentHeaders `
    -ContentType "application/json" `
    -Body (@{
      itemId = $item.data.id
      branchId = $mainBranch.id
    } | ConvertTo-Json)

  throw "Duplicate reservation test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Duplicate reservation protection: OK"
  } else {
    throw
  }
}

Write-Host "11) Academically INACTIVE student cannot reserve..."
$inactiveItem = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint4A Inactive Student Book $suffix"
  } | ConvertTo-Json)

$inactiveCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $inactiveItem.data.id
    branchId = $mainBranch.id
    copyCode = "S4A-$suffix-INACTIVE"
    barcode = "S4A-BAR-$suffix-INACTIVE"
    status = "AVAILABLE"
  } | ConvertTo-Json)

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations" `
    -Headers $inactiveHeaders `
    -ContentType "application/json" `
    -Body (@{
      itemId = $inactiveItem.data.id
      branchId = $mainBranch.id
    } | ConvertTo-Json)

  throw "Inactive academic-status test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Academic eligibility protection: OK"
  } else {
    throw
  }
}

Write-Host "12) MANAGEMENT cannot create a student reservation..."
$management = DevLogin "management@sams.dev"
$managementHeaders = @{
  Authorization = "Bearer $($management.accessToken)"
}

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations" `
    -Headers $managementHeaders `
    -ContentType "application/json" `
    -Body (@{
      itemId = $inactiveItem.data.id
      branchId = $mainBranch.id
    } | ConvertTo-Json)

  throw "Management reservation RBAC test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Reservation RBAC: OK"
  } else {
    throw
  }
}

Write-Host "13) Create last-copy concurrency item..."
$raceItem = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint4A Last Copy Race $suffix"
  } | ConvertTo-Json)

$raceCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $raceItem.data.id
    branchId = $mainBranch.id
    copyCode = "S4A-$suffix-RACE"
    barcode = "S4A-BAR-$suffix-RACE"
    status = "AVAILABLE"
  } | ConvertTo-Json)

Write-Host "14) Run real competing reservation requests..."
& node `
  .\scripts\sprint4\sprint4a-concurrency-smoke.js `
  $raceItem.data.id `
  $mainBranch.id `
  "student@sams.dev" `
  $studentBEmail

if ($LASTEXITCODE -ne 0) {
  throw "Reservation concurrency smoke failed"
}

Write-Host "15) Last copy must be RESERVED exactly once..."
$raceCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($raceCopy.data.id)" `
  -Headers $librarianHeaders

if ($raceCopyAfter.data.status -ne "RESERVED") {
  throw "Race-test copy should be RESERVED"
}

Write-Host "Last-copy state: OK"

Write-Host "16) Cleanup temporary policy fixture..."
& node `
  .\scripts\sprint4\sprint4a-policy-fixture.js `
  cleanup | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not cleanup policy fixture"
}

Write-Host ""
Write-Host "Sprint 4A reservation core smoke PASSED."
