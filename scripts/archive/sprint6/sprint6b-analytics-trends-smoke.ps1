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
      status = "AVAILABLE"
      condition = "GOOD"
    } | ConvertTo-Json)
}

function Checkout($studentNumber, $copyId, $headers) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/checkout" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      studentNumber = $studentNumber
      copyId = $copyId
    } | ConvertTo-Json)
}

function ReturnGood($borrowingId, $headers) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/$borrowingId/return" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      outcome = "GOOD"
    } | ConvertTo-Json)
}

function SumSeries($data, $property) {
  return (
    $data |
      Measure-Object `
        -Property $property `
        -Sum
  ).Sum
}

$suffix =
  [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Create temporary analytics circulation policy..."
& node `
  .\scripts\sprint6\sprint6a-policy-fixture.js `
  create | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not create Sprint 6 policy fixture"
}

Write-Host "2) Login as Librarian, Management, Student..."
$librarian = DevLogin "librarian@sams.dev"
$librarianHeaders = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

$management = DevLogin "management@sams.dev"
$managementHeaders = @{
  Authorization = "Bearer $($management.accessToken)"
}

$seedStudent = DevLogin "student@sams.dev"
$seedStudentHeaders = @{
  Authorization = "Bearer $($seedStudent.accessToken)"
}

Write-Host "3) Student cannot access analytics trends..."
try {
  Invoke-RestMethod `
    -Method Get `
    -Uri "http://localhost:4000/api/v1/analytics/trends" `
    -Headers $seedStudentHeaders

  throw "Student trends RBAC should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Analytics trends RBAC: OK"
  } else {
    throw
  }
}

Write-Host "4) Resolve MAIN branch..."
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

Write-Host "5) Import three temporary ACTIVE students..."
$studentAId = "S6B-A-$suffix"
$studentBId = "S6B-B-$suffix"
$studentCId = "S6B-C-$suffix"

$studentAEmail = "sprint6b-a-$suffix@sams.dev"
$studentBEmail = "sprint6b-b-$suffix@sams.dev"
$studentCEmail = "sprint6b-c-$suffix@sams.dev"

$importBody = @{
  students = @(
    @{
      studentId = $studentAId
      universityEmail = $studentAEmail
      displayName = "Sprint6B Student A"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentBId
      universityEmail = $studentBEmail
      displayName = "Sprint6B Student B"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentCId
      universityEmail = $studentCEmail
      displayName = "Sprint6B Student C"
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

Write-Host "6) Define narrow period and capture branch baseline..."
$periodStart =
  [DateTimeOffset]::UtcNow.AddSeconds(-2)

$periodEnd =
  [DateTimeOffset]::UtcNow.AddHours(1)

$fromEncoded =
  [uri]::EscapeDataString(
    $periodStart.ToString("o")
  )

$toEncoded =
  [uri]::EscapeDataString(
    $periodEnd.ToString("o")
  )

$branchComparisonUri =
  "http://localhost:4000/api/v1/analytics/branches?from=$fromEncoded&to=$toEncoded"

$trendUri =
  "http://localhost:4000/api/v1/analytics/trends?branchId=$($mainBranch.id)&from=$fromEncoded&to=$toEncoded&bucket=DAY"

$baselineComparison = Invoke-RestMethod `
  -Method Get `
  -Uri $branchComparisonUri `
  -Headers $managementHeaders

$baselineMain =
  $baselineComparison.data.data |
  Where-Object { $_.branch.id -eq $mainBranch.id } |
  Select-Object -First 1

if (-not $baselineMain) {
  throw "MAIN branch missing from analytics comparison"
}

$baselineTrend = Invoke-RestMethod `
  -Method Get `
  -Uri $trendUri `
  -Headers $managementHeaders

$baselineBorrowingsStarted =
  SumSeries $baselineTrend.data.data "borrowingsStarted"

$baselineReturns =
  SumSeries $baselineTrend.data.data "returns"

$baselineReservationsCreated =
  SumSeries $baselineTrend.data.data "reservationsCreated"

$baselineVisits =
  SumSeries $baselineTrend.data.data "visits"

$baselineUniqueVisitors =
  SumSeries $baselineTrend.data.data "uniqueVisitors"

Write-Host "Branch + trend baseline: OK"

Write-Host "7) Create top item with TWO checkout events..."
$topItem = CreateBook `
  "Sprint6B Top Borrowed $suffix" `
  $librarianHeaders

$topCopyA = CreateCopy `
  $topItem.data.id `
  $mainBranch.id `
  "S6B-$suffix-TOP-A" `
  $librarianHeaders

$topCopyB = CreateCopy `
  $topItem.data.id `
  $mainBranch.id `
  "S6B-$suffix-TOP-B" `
  $librarianHeaders

$topBorrowA = Checkout `
  $studentAId `
  $topCopyA.data.id `
  $librarianHeaders

$topBorrowB = Checkout `
  $studentBId `
  $topCopyB.data.id `
  $librarianHeaders

ReturnGood `
  $topBorrowA.data.id `
  $librarianHeaders | Out-Null

ReturnGood `
  $topBorrowB.data.id `
  $librarianHeaders | Out-Null

Write-Host "8) Create second item with ONE checkout event..."
$secondItem = CreateBook `
  "Sprint6B Second Borrowed $suffix" `
  $librarianHeaders

$secondCopy = CreateCopy `
  $secondItem.data.id `
  $mainBranch.id `
  "S6B-$suffix-SECOND" `
  $librarianHeaders

$secondBorrow = Checkout `
  $studentCId `
  $secondCopy.data.id `
  $librarianHeaders

ReturnGood `
  $secondBorrow.data.id `
  $librarianHeaders | Out-Null

Write-Host "9) Create one reservation event..."
$reservationItem = CreateBook `
  "Sprint6B Reserved Item $suffix" `
  $librarianHeaders

$reservationCopy = CreateCopy `
  $reservationItem.data.id `
  $mainBranch.id `
  "S6B-$suffix-RES" `
  $librarianHeaders

$reservation = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations" `
  -Headers $studentAHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $reservationItem.data.id
    branchId = $mainBranch.id
  } | ConvertTo-Json)

if ($reservation.data.status -ne "ACTIVE") {
  throw "Reservation fixture should be ACTIVE"
}

Write-Host "10) Create two visit events..."
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

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/$($visitA.data.id)/check-out" `
  -Headers $librarianHeaders | Out-Null

$visitB = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/check-in" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    studentNumber = $studentBId
    branchId = $mainBranch.id
    source = "QR"
  } | ConvertTo-Json)

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/visits/$($visitB.data.id)/check-out" `
  -Headers $librarianHeaders | Out-Null

Write-Host "11) Validate DAY trend dataset..."
$trends = Invoke-RestMethod `
  -Method Get `
  -Uri $trendUri `
  -Headers $managementHeaders

if ($trends.data.scope.bucket -ne "DAY") {
  throw "Trend bucket contract mismatch"
}

if ($trends.data.scope.bucketTimezone -ne "UTC") {
  throw "Trend bucket timezone mismatch"
}

$borrowingsDelta =
  (SumSeries $trends.data.data "borrowingsStarted") -
  $baselineBorrowingsStarted

$returnsDelta =
  (SumSeries $trends.data.data "returns") -
  $baselineReturns

$reservationsDelta =
  (SumSeries $trends.data.data "reservationsCreated") -
  $baselineReservationsCreated

$visitsDelta =
  (SumSeries $trends.data.data "visits") -
  $baselineVisits

$uniqueVisitorsDelta =
  (SumSeries $trends.data.data "uniqueVisitors") -
  $baselineUniqueVisitors

if ($borrowingsDelta -ne 3) {
  throw "Expected borrowing trend delta = 3, got $borrowingsDelta"
}

if ($returnsDelta -ne 3) {
  throw "Expected return trend delta = 3, got $returnsDelta"
}

if ($reservationsDelta -ne 1) {
  throw "Expected reservation trend delta = 1, got $reservationsDelta"
}

if ($visitsDelta -ne 2) {
  throw "Expected visit trend delta = 2, got $visitsDelta"
}

if ($uniqueVisitorsDelta -ne 2) {
  throw "Expected unique-visitor trend delta = 2, got $uniqueVisitorsDelta"
}

Write-Host "DAY trend dataset delta: OK"

Write-Host "12) WEEK + MONTH buckets must also be valid..."
$weekTrend = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/analytics/trends?branchId=$($mainBranch.id)&from=$fromEncoded&to=$toEncoded&bucket=WEEK" `
  -Headers $librarianHeaders

$monthTrend = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/analytics/trends?branchId=$($mainBranch.id)&from=$fromEncoded&to=$toEncoded&bucket=MONTH" `
  -Headers $librarianHeaders

if ($weekTrend.data.data.Count -lt 1 -or $monthTrend.data.data.Count -lt 1) {
  throw "WEEK/MONTH trend datasets should not be empty"
}

Write-Host "WEEK/MONTH trend buckets: OK"

Write-Host "13) Validate branch comparison deltas..."
$afterComparison = Invoke-RestMethod `
  -Method Get `
  -Uri $branchComparisonUri `
  -Headers $managementHeaders

$afterMain =
  $afterComparison.data.data |
  Where-Object { $_.branch.id -eq $mainBranch.id } |
  Select-Object -First 1

if (
  ($afterMain.catalog.physicalCopies -
   $baselineMain.catalog.physicalCopies) -ne 4
) {
  throw "Expected MAIN physicalCopies delta = 4"
}

if (
  ($afterMain.catalog.availableCopies -
   $baselineMain.catalog.availableCopies) -ne 3
) {
  throw "Expected MAIN availableCopies delta = 3"
}

if (
  ($afterMain.reservations.createdInPeriod -
   $baselineMain.reservations.createdInPeriod) -ne 1
) {
  throw "Expected MAIN reservation event delta = 1"
}

if (
  ($afterMain.circulation.borrowingsStartedInPeriod -
   $baselineMain.circulation.borrowingsStartedInPeriod) -ne 3
) {
  throw "Expected MAIN borrowingsStarted delta = 3"
}

if (
  ($afterMain.circulation.returnsInPeriod -
   $baselineMain.circulation.returnsInPeriod) -ne 3
) {
  throw "Expected MAIN returns delta = 3"
}

if (
  ($afterMain.visits.visitsInPeriod -
   $baselineMain.visits.visitsInPeriod) -ne 2
) {
  throw "Expected MAIN visits delta = 2"
}

if (
  ($afterMain.visits.uniqueVisitorsInPeriod -
   $baselineMain.visits.uniqueVisitorsInPeriod) -ne 2
) {
  throw "Expected MAIN uniqueVisitors delta = 2"
}

Write-Host "Branch comparison dataset: OK"

Write-Host "14) Validate top BORROWINGS items..."
$topBorrowings = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/analytics/top-items?metric=BORROWINGS&branchId=$($mainBranch.id)&from=$fromEncoded&to=$toEncoded&limit=20" `
  -Headers $managementHeaders

$topMatch =
  $topBorrowings.data.data |
  Where-Object { $_.item.id -eq $topItem.data.id } |
  Select-Object -First 1

$secondMatch =
  $topBorrowings.data.data |
  Where-Object { $_.item.id -eq $secondItem.data.id } |
  Select-Object -First 1

if (-not $topMatch -or $topMatch.count -ne 2) {
  throw "Top borrowed item should have count = 2"
}

if (-not $secondMatch -or $secondMatch.count -ne 1) {
  throw "Second borrowed item should have count = 1"
}

if ($topMatch.rank -ge $secondMatch.rank) {
  throw "Top borrowed item should rank above second item"
}

Write-Host "Top BORROWINGS dataset: OK"

Write-Host "15) Validate top RESERVATIONS items..."
$topReservations = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/analytics/top-items?metric=RESERVATIONS&branchId=$($mainBranch.id)&from=$fromEncoded&to=$toEncoded&limit=20" `
  -Headers $librarianHeaders

$reservationMatch =
  $topReservations.data.data |
  Where-Object { $_.item.id -eq $reservationItem.data.id } |
  Select-Object -First 1

if (-not $reservationMatch -or $reservationMatch.count -ne 1) {
  throw "Reserved item should have reservation count = 1"
}

Write-Host "Top RESERVATIONS dataset: OK"

Write-Host "16) Cleanup temporary analytics policy fixture..."
& node `
  .\scripts\sprint6\sprint6a-policy-fixture.js `
  cleanup | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not cleanup Sprint 6 policy fixture"
}

Write-Host ""
Write-Host "Sprint 6B analytics trends + branches smoke PASSED."
