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

$suffix =
  [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Create temporary analytics circulation policy..."
& node `
  .\scripts\sprint6\sprint6a-policy-fixture.js `
  create | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not create Sprint 6A policy fixture"
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

Write-Host "3) Student must not access analytics..."
try {
  Invoke-RestMethod `
    -Method Get `
    -Uri "http://localhost:4000/api/v1/analytics/overview" `
    -Headers $seedStudentHeaders

  throw "Student analytics RBAC should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Analytics RBAC: OK"
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

Write-Host "5) Import two temporary ACTIVE students..."
$studentAId = "S6A-A-$suffix"
$studentBId = "S6A-B-$suffix"

$studentAEmail = "sprint6a-a-$suffix@sams.dev"
$studentBEmail = "sprint6a-b-$suffix@sams.dev"

$importBody = @{
  students = @(
    @{
      studentId = $studentAId
      universityEmail = $studentAEmail
      displayName = "Sprint6A Student A"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentBId
      universityEmail = $studentBEmail
      displayName = "Sprint6A Student B"
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

Write-Host "6) Capture baseline branch snapshot..."
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

$overviewUri =
  "http://localhost:4000/api/v1/analytics/overview?branchId=$($mainBranch.id)&from=$fromEncoded&to=$toEncoded"

$baseline = Invoke-RestMethod `
  -Method Get `
  -Uri $overviewUri `
  -Headers $managementHeaders

Write-Host "Baseline captured."

Write-Host "7) Create one plain AVAILABLE holding..."
$availableItem = CreateBook `
  "Sprint6A Available Holding $suffix" `
  $librarianHeaders

$availableCopy = CreateCopy `
  $availableItem.data.id `
  $mainBranch.id `
  "S6A-$suffix-AVAILABLE" `
  $librarianHeaders

Write-Host "8) Create one current ACTIVE loan..."
$activeItem = CreateBook `
  "Sprint6A Active Loan $suffix" `
  $librarianHeaders

$activeCopy = CreateCopy `
  $activeItem.data.id `
  $mainBranch.id `
  "S6A-$suffix-ACTIVE" `
  $librarianHeaders

$activeBorrowing = Checkout `
  $studentAId `
  $activeCopy.data.id `
  $librarianHeaders

Write-Host "9) Create one OVERDUE active loan..."
$overdueItem = CreateBook `
  "Sprint6A Overdue Loan $suffix" `
  $librarianHeaders

$overdueCopy = CreateCopy `
  $overdueItem.data.id `
  $mainBranch.id `
  "S6A-$suffix-OVERDUE" `
  $librarianHeaders

$overdueBorrowing = Checkout `
  $studentBId `
  $overdueCopy.data.id `
  $librarianHeaders

& node `
  .\scripts\sprint6\sprint6a-force-overdue.js `
  $overdueBorrowing.data.id | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not create overdue fixture"
}

Write-Host "10) Create one checkout + return inside period..."
$returnItem = CreateBook `
  "Sprint6A Returned Loan $suffix" `
  $librarianHeaders

$returnCopy = CreateCopy `
  $returnItem.data.id `
  $mainBranch.id `
  "S6A-$suffix-RETURN" `
  $librarianHeaders

$returnBorrowing = Checkout `
  $studentAId `
  $returnCopy.data.id `
  $librarianHeaders

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/borrowings/$($returnBorrowing.data.id)/return" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    outcome = "GOOD"
  } | ConvertTo-Json) | Out-Null

Write-Host "11) Create one active reservation hold..."
$reservationItem = CreateBook `
  "Sprint6A Active Reservation $suffix" `
  $librarianHeaders

$reservationCopy = CreateCopy `
  $reservationItem.data.id `
  $mainBranch.id `
  "S6A-$suffix-RESERVATION" `
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
  throw "Analytics reservation fixture should be ACTIVE"
}

Write-Host "12) Create one closed visit + one open visit..."
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

Write-Host "13) Read analytics overview..."
$after = Invoke-RestMethod `
  -Method Get `
  -Uri $overviewUri `
  -Headers $managementHeaders

Write-Host "14) Validate catalog KPI deltas..."
if (
  ($after.data.catalog.activeItems -
   $baseline.data.catalog.activeItems) -ne 5
) {
  throw "Expected activeItems delta = 5"
}

if (
  ($after.data.catalog.physicalCopies -
   $baseline.data.catalog.physicalCopies) -ne 5
) {
  throw "Expected physicalCopies delta = 5"
}

if (
  ($after.data.catalog.availableCopies -
   $baseline.data.catalog.availableCopies) -ne 2
) {
  throw "Expected availableCopies delta = 2"
}

Write-Host "Catalog KPI formulas: OK"

Write-Host "15) Validate reservation KPIs..."
if (
  ($after.data.reservations.activeHolds -
   $baseline.data.reservations.activeHolds) -ne 1
) {
  throw "Expected activeHolds delta = 1"
}

if (
  ($after.data.reservations.createdInPeriod -
   $baseline.data.reservations.createdInPeriod) -lt 1
) {
  throw "Expected at least one reservation created in period"
}

Write-Host "Reservation KPI formulas: OK"

Write-Host "16) Validate circulation KPIs..."
if (
  ($after.data.circulation.activeLoans -
   $baseline.data.circulation.activeLoans) -ne 2
) {
  throw "Expected activeLoans delta = 2"
}

if (
  ($after.data.circulation.overdueLoans -
   $baseline.data.circulation.overdueLoans) -ne 1
) {
  throw "Expected overdueLoans delta = 1"
}

if (
  ($after.data.circulation.borrowingsStartedInPeriod -
   $baseline.data.circulation.borrowingsStartedInPeriod) -lt 2
) {
  throw "Expected at least two borrowings started in period"
}

if (
  ($after.data.circulation.returnsInPeriod -
   $baseline.data.circulation.returnsInPeriod) -ne 1
) {
  throw "Expected returnsInPeriod delta = 1"
}

Write-Host "Circulation KPI formulas: OK"

Write-Host "17) Validate visit KPIs..."
if (
  ($after.data.visits.visitsInPeriod -
   $baseline.data.visits.visitsInPeriod) -ne 2
) {
  throw "Expected visitsInPeriod delta = 2"
}

if (
  ($after.data.visits.uniqueVisitorsInPeriod -
   $baseline.data.visits.uniqueVisitorsInPeriod) -ne 2
) {
  throw "Expected uniqueVisitorsInPeriod delta = 2"
}

if (
  ($after.data.visits.openVisits -
   $baseline.data.visits.openVisits) -ne 1
) {
  throw "Expected openVisits delta = 1"
}

if ($after.data.visits.averageClosedVisitMinutes -lt 0) {
  throw "averageClosedVisitMinutes must be non-negative"
}

Write-Host "Visit KPI formulas: OK"

Write-Host "18) Validate scope + branch..."
if ($after.data.scope.branch.id -ne $mainBranch.id) {
  throw "Analytics branch scope mismatch"
}

if ($after.data.scope.periodSemantics -ne "[from, to)") {
  throw "Analytics period semantics mismatch"
}

Write-Host "Analytics scope contract: OK"

Write-Host "19) Librarian can also read analytics..."
$librarianOverview = Invoke-RestMethod `
  -Method Get `
  -Uri $overviewUri `
  -Headers $librarianHeaders

if (-not $librarianOverview.data.catalog) {
  throw "Librarian analytics read failed"
}

Write-Host "Librarian analytics RBAC: OK"

Write-Host "20) Cleanup temporary analytics policy fixture..."
& node `
  .\scripts\sprint6\sprint6a-policy-fixture.js `
  cleanup | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not cleanup Sprint 6A policy fixture"
}

Write-Host ""
Write-Host "Sprint 6A analytics overview smoke PASSED."
