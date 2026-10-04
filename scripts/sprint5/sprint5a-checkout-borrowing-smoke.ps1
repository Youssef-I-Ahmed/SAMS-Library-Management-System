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

function CreateBook($title, $headers) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/catalog/items" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      type = "BOOK"
      title = $title
    } | ConvertTo-Json)
}

function CreateCopy($itemId, $branchId, $code, $headers) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/inventory/copies" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      itemId = $itemId
      branchId = $branchId
      copyCode = $code
      barcode = "BAR-$code"
      shelfLocation = "Sprint5A Shelf"
      status = "AVAILABLE"
      condition = "GOOD"
    } | ConvertTo-Json)
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Create temporary circulation-policy fixture..."
$policyRaw = & node `
  .\scripts\sprint5\sprint5a-policy-fixture.js `
  create

if ($LASTEXITCODE -ne 0) {
  throw "Could not create Sprint 5A policy fixture"
}

$policy = $policyRaw | ConvertFrom-Json
Write-Host "Loan days:" $policy.loanDays
Write-Host "Max active loans:" $policy.maxActiveLoans

Write-Host "2) Login as Librarian + Management..."
$librarian = DevLogin "librarian@sams.dev"
$librarianHeaders = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

$management = DevLogin "management@sams.dev"
$managementHeaders = @{
  Authorization = "Bearer $($management.accessToken)"
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

Write-Host "4) Import three temporary ACTIVE students..."
$studentAId = "S5A-A-$suffix"
$studentBId = "S5A-B-$suffix"
$studentCId = "S5A-C-$suffix"

$studentAEmail = "sprint5a-a-$suffix@sams.dev"
$studentBEmail = "sprint5a-b-$suffix@sams.dev"
$studentCEmail = "sprint5a-c-$suffix@sams.dev"

$importBody = @{
  students = @(
    @{
      studentId = $studentAId
      universityEmail = $studentAEmail
      displayName = "Sprint5A Student A"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentBId
      universityEmail = $studentBEmail
      displayName = "Sprint5A Student B"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentCId
      universityEmail = $studentCEmail
      displayName = "Sprint5A Student C"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
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

$studentA = DevLogin $studentAEmail
$studentAHeaders = @{
  Authorization = "Bearer $($studentA.accessToken)"
}

Write-Host "Temporary students: OK"

Write-Host "5) Create reserved checkout item + copy..."
$reservedItem = CreateBook `
  "Sprint5A Reserved Checkout $suffix" `
  $librarianHeaders

$reservedCopy = CreateCopy `
  $reservedItem.data.id `
  $mainBranch.id `
  "S5A-$suffix-RES" `
  $librarianHeaders

Write-Host "6) Student A reserves the item..."
$reservation = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations" `
  -Headers $studentAHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $reservedItem.data.id
    branchId = $mainBranch.id
  } | ConvertTo-Json)

if ($reservation.data.status -ne "ACTIVE") {
  throw "Reservation should be ACTIVE before checkout"
}

Write-Host "Reservation ACTIVE: OK"

Write-Host "7) Librarian fulfills reservation through checkout..."
$reservedBorrowing = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/borrowings/checkout" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    reservationId = $reservation.data.id
    notes = "Sprint5A reservation checkout"
  } | ConvertTo-Json)

if ($reservedBorrowing.data.status -ne "ACTIVE") {
  throw "Borrowing should be ACTIVE"
}

if ($reservedBorrowing.data.reservationId -ne $reservation.data.id) {
  throw "Borrowing is not linked to reservation"
}

if ($reservedBorrowing.data.copy.id -ne $reservedCopy.data.id) {
  throw "Checkout used the wrong allocated copy"
}

$borrowedAt = [DateTimeOffset]::Parse($reservedBorrowing.data.borrowedAt)
$dueAt = [DateTimeOffset]::Parse($reservedBorrowing.data.dueAt)
$loanHours = ($dueAt - $borrowedAt).TotalHours

if ($loanHours -lt (($policy.loanDays * 24) - 0.1) -or $loanHours -gt (($policy.loanDays * 24) + 0.1)) {
  throw "dueAt does not match policy loanDays"
}

Write-Host "Policy-based due date: OK"

Write-Host "8) Reservation must be FULFILLED..."
$reservationAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations/$($reservation.data.id)" `
  -Headers $librarianHeaders

if ($reservationAfter.data.status -ne "FULFILLED") {
  throw "Reservation was not fulfilled by checkout"
}

if (-not $reservationAfter.data.fulfilledAt) {
  throw "Reservation fulfilledAt is missing"
}

Write-Host "ACTIVE reservation -> FULFILLED: OK"

Write-Host "9) Reserved copy must now be BORROWED..."
$reservedCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($reservedCopy.data.id)" `
  -Headers $librarianHeaders

if ($reservedCopyAfter.data.status -ne "BORROWED") {
  throw "Reserved checkout did not move copy to BORROWED"
}

Write-Host "RESERVED copy -> BORROWED: OK"

Write-Host "10) Direct walk-in checkout without reservation..."
$directItem = CreateBook `
  "Sprint5A Direct Checkout $suffix" `
  $librarianHeaders

$directCopy = CreateCopy `
  $directItem.data.id `
  $mainBranch.id `
  "S5A-$suffix-DIRECT" `
  $librarianHeaders

$directBorrowing = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/borrowings/checkout" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    studentNumber = $studentAId
    copyId = $directCopy.data.id
    notes = "Sprint5A direct checkout"
  } | ConvertTo-Json)

if ($directBorrowing.data.status -ne "ACTIVE") {
  throw "Direct borrowing should be ACTIVE"
}

if ($directBorrowing.data.reservationId) {
  throw "Direct checkout should not have a reservationId"
}

Write-Host "Direct checkout: OK"

Write-Host "11) Max active loan policy must be enforced..."
$limitItem = CreateBook `
  "Sprint5A Loan Limit $suffix" `
  $librarianHeaders

$limitCopy = CreateCopy `
  $limitItem.data.id `
  $mainBranch.id `
  "S5A-$suffix-LIMIT" `
  $librarianHeaders

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/checkout" `
    -Headers $librarianHeaders `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $studentAId
      copyId = $limitCopy.data.id
    } | ConvertTo-Json)

  throw "Loan-limit checkout should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "maxActiveLoans protection: OK"
  } else {
    throw
  }
}

$limitCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($limitCopy.data.id)" `
  -Headers $librarianHeaders

if ($limitCopyAfter.data.status -ne "AVAILABLE") {
  throw "Rejected loan-limit checkout changed copy state"
}

Write-Host "Rejected checkout left inventory unchanged: OK"

Write-Host "12) Student can read own borrowing history..."
$mine = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/borrowings/me?status=ACTIVE&pageSize=100" `
  -Headers $studentAHeaders

$currentIds = @($mine.data | ForEach-Object { $_.id })

if ($reservedBorrowing.data.id -notin $currentIds -or $directBorrowing.data.id -notin $currentIds) {
  throw "Student borrowing history is missing active loans"
}

$mineJson = $mine | ConvertTo-Json -Depth 30

if ($mineJson -match [regex]::Escape($reservedCopy.data.id)) {
  throw "Student borrowing history leaked PhysicalCopy.id"
}

if ($mineJson -match [regex]::Escape("BAR-S5A-$suffix-RES")) {
  throw "Student borrowing history leaked barcode"
}

if ($mineJson -match "copyCode") {
  throw "Student borrowing history leaked copyCode"
}

Write-Host "Student borrowing history + privacy: OK"

Write-Host "13) Student and Management cannot perform checkout..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/checkout" `
    -Headers $studentAHeaders `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $studentBId
      copyId = $limitCopy.data.id
    } | ConvertTo-Json)

  throw "Student checkout RBAC test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Student checkout RBAC: OK"
  } else {
    throw
  }
}

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/checkout" `
    -Headers $managementHeaders `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $studentBId
      copyId = $limitCopy.data.id
    } | ConvertTo-Json)

  throw "Management checkout RBAC test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Management checkout RBAC: OK"
  } else {
    throw
  }
}

Write-Host "14) Librarian / Management can read operations queue..."
$q = [uri]::EscapeDataString("Sprint5A Reserved Checkout $suffix")

$librarianQueue = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/borrowings?q=$q&status=ACTIVE" `
  -Headers $librarianHeaders

$queueBorrowing = $librarianQueue.data |
  Where-Object { $_.id -eq $reservedBorrowing.data.id } |
  Select-Object -First 1

if (-not $queueBorrowing) {
  throw "Librarian borrowing queue did not find checkout"
}

if ($queueBorrowing.student.studentId -ne $studentAId) {
  throw "Borrowing queue student mismatch"
}

if ($queueBorrowing.copy.id -ne $reservedCopy.data.id) {
  throw "Borrowing queue copy mismatch"
}

$managementQueue = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/borrowings?q=$q" `
  -Headers $managementHeaders

if (-not ($managementQueue.data | Where-Object { $_.id -eq $reservedBorrowing.data.id })) {
  throw "Management read-only borrowing queue failed"
}

Write-Host "Operations borrowing queue: OK"

Write-Host "15) Create one-copy checkout race..."
$raceItem = CreateBook `
  "Sprint5A Checkout Race $suffix" `
  $librarianHeaders

$raceCopy = CreateCopy `
  $raceItem.data.id `
  $mainBranch.id `
  "S5A-$suffix-RACE" `
  $librarianHeaders

Write-Host "16) Run concurrent direct checkouts..."
& node `
  .\scripts\sprint5\sprint5a-checkout-concurrency-smoke.js `
  $librarian.accessToken `
  $raceCopy.data.id `
  $studentBId `
  $studentCId

if ($LASTEXITCODE -ne 0) {
  throw "Sprint 5A checkout concurrency smoke failed"
}

$raceCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($raceCopy.data.id)" `
  -Headers $librarianHeaders

if ($raceCopyAfter.data.status -ne "BORROWED") {
  throw "Race copy should be BORROWED once"
}

Write-Host "Race copy final state: BORROWED"

Write-Host "17) Cleanup temporary policy fixture..."
& node `
  .\scripts\sprint5\sprint5a-policy-fixture.js `
  cleanup | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not cleanup Sprint 5A policy fixture"
}

Write-Host ""
Write-Host "Sprint 5A checkout + borrowing core smoke PASSED."
