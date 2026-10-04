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
      shelfLocation = "Sprint5B Shelf"
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

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Create temporary circulation-policy fixture..."
& node `
  .\scripts\sprint5\sprint5a-policy-fixture.js `
  create | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not create Sprint 5 policy fixture"
}

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
$studentGoodId = "S5B-G-$suffix"
$studentDamagedId = "S5B-D-$suffix"
$studentLostId = "S5B-L-$suffix"

$studentGoodEmail = "sprint5b-good-$suffix@sams.dev"
$studentDamagedEmail = "sprint5b-damaged-$suffix@sams.dev"
$studentLostEmail = "sprint5b-lost-$suffix@sams.dev"

$importBody = @{
  students = @(
    @{
      studentId = $studentGoodId
      universityEmail = $studentGoodEmail
      displayName = "Sprint5B Good Return"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentDamagedId
      universityEmail = $studentDamagedEmail
      displayName = "Sprint5B Damaged Return"
      facultyName = "DEV Faculty"
      departmentName = "DEV Department"
      academicStatus = "ACTIVE"
      isActive = $true
    },
    @{
      studentId = $studentLostId
      universityEmail = $studentLostEmail
      displayName = "Sprint5B Lost Item"
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

$studentGood = DevLogin $studentGoodEmail
$studentGoodHeaders = @{
  Authorization = "Bearer $($studentGood.accessToken)"
}

Write-Host "Temporary students: OK"

Write-Host "5) Create checkout that will become overdue..."
$overdueItem = CreateBook `
  "Sprint5B Overdue Return $suffix" `
  $librarianHeaders

$overdueCopy = CreateCopy `
  $overdueItem.data.id `
  $mainBranch.id `
  "S5B-$suffix-OVERDUE" `
  $librarianHeaders

$overdueBorrowing = Checkout `
  $studentGoodId `
  $overdueCopy.data.id `
  $librarianHeaders

Write-Host "6) Force borrowing due date into the past..."
& node `
  .\scripts\sprint5\sprint5b-force-overdue.js `
  $overdueBorrowing.data.id | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not force overdue borrowing"
}

Write-Host "Overdue fixture: OK"

Write-Host "7) Student history reports derived overdue state..."
$mineBefore = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/borrowings/me?status=ACTIVE&pageSize=100" `
  -Headers $studentGoodHeaders

$mineOverdue = $mineBefore.data |
  Where-Object { $_.id -eq $overdueBorrowing.data.id } |
  Select-Object -First 1

if (-not $mineOverdue) {
  throw "Overdue borrowing missing from student history"
}

if (-not $mineOverdue.isOverdue) {
  throw "Expected isOverdue=true"
}

if ($mineOverdue.overdueDays -lt 1) {
  throw "Expected overdueDays >= 1"
}

Write-Host "Derived overdue state: OK"

Write-Host "8) Operations overdueOnly filter finds it..."
$overdueQueue = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/borrowings?overdueOnly=true&pageSize=100" `
  -Headers $librarianHeaders

if (-not ($overdueQueue.data | Where-Object { $_.id -eq $overdueBorrowing.data.id })) {
  throw "overdueOnly filter did not find overdue borrowing"
}

Write-Host "Overdue queue filter: OK"

Write-Host "9) Librarian returns overdue copy in GOOD condition..."
$returned = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/borrowings/$($overdueBorrowing.data.id)/return" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    outcome = "GOOD"
    notes = "Returned after due date"
  } | ConvertTo-Json)

if ($returned.data.status -ne "RETURNED") {
  throw "GOOD return should set borrowing status RETURNED"
}

if ($returned.data.returnCondition -ne "GOOD") {
  throw "GOOD return condition was not stored"
}

if (-not $returned.data.returnedAt) {
  throw "GOOD return should set returnedAt"
}

if (-not $returned.data.wasReturnedOverdue) {
  throw "Expected wasReturnedOverdue=true"
}

if ($returned.data.overdueAtReturnDays -lt 1) {
  throw "Expected overdueAtReturnDays >= 1"
}

Write-Host "Overdue return metrics: OK"

$overdueCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($overdueCopy.data.id)" `
  -Headers $librarianHeaders

if ($overdueCopyAfter.data.status -ne "AVAILABLE") {
  throw "GOOD return should release copy to AVAILABLE"
}

if ($overdueCopyAfter.data.condition -ne "GOOD") {
  throw "GOOD return should set copy condition GOOD"
}

Write-Host "GOOD return -> AVAILABLE: OK"

Write-Host "10) Double return must be rejected..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/$($overdueBorrowing.data.id)/return" `
    -Headers $librarianHeaders `
    -ContentType "application/json" `
    -Body (@{
      outcome = "GOOD"
    } | ConvertTo-Json)

  throw "Double return should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Double-return protection: OK"
  } else {
    throw
  }
}

Write-Host "11) DAMAGED return closes loan and quarantines copy..."
$damagedItem = CreateBook `
  "Sprint5B Damaged Return $suffix" `
  $librarianHeaders

$damagedCopy = CreateCopy `
  $damagedItem.data.id `
  $mainBranch.id `
  "S5B-$suffix-DAMAGED" `
  $librarianHeaders

$damagedBorrowing = Checkout `
  $studentDamagedId `
  $damagedCopy.data.id `
  $librarianHeaders

$damagedReturn = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/borrowings/$($damagedBorrowing.data.id)/return" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    outcome = "DAMAGED"
    notes = "Cover damaged during loan"
  } | ConvertTo-Json)

if ($damagedReturn.data.status -ne "RETURNED") {
  throw "DAMAGED outcome should close borrowing as RETURNED"
}

if ($damagedReturn.data.returnCondition -ne "DAMAGED") {
  throw "DAMAGED return condition missing"
}

$damagedCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($damagedCopy.data.id)" `
  -Headers $librarianHeaders

if ($damagedCopyAfter.data.status -ne "DAMAGED") {
  throw "DAMAGED return should set copy status DAMAGED"
}

if ($damagedCopyAfter.data.condition -ne "DAMAGED") {
  throw "DAMAGED return should set copy condition DAMAGED"
}

Write-Host "DAMAGED return lifecycle: OK"

Write-Host "12) LOST outcome closes loan as LOST and marks copy LOST..."
$lostItem = CreateBook `
  "Sprint5B Lost Item $suffix" `
  $librarianHeaders

$lostCopy = CreateCopy `
  $lostItem.data.id `
  $mainBranch.id `
  "S5B-$suffix-LOST" `
  $librarianHeaders

$lostBorrowing = Checkout `
  $studentLostId `
  $lostCopy.data.id `
  $librarianHeaders

$lostReturn = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/borrowings/$($lostBorrowing.data.id)/return" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    outcome = "LOST"
    notes = "Student reported item lost"
  } | ConvertTo-Json)

if ($lostReturn.data.status -ne "LOST") {
  throw "LOST outcome should set borrowing status LOST"
}

if ($lostReturn.data.returnCondition -ne "LOST") {
  throw "LOST returnCondition missing"
}

if ($lostReturn.data.returnedAt) {
  throw "LOST item should not receive a physical returnedAt timestamp"
}

$lostCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($lostCopy.data.id)" `
  -Headers $librarianHeaders

if ($lostCopyAfter.data.status -ne "LOST") {
  throw "LOST outcome should set copy status LOST"
}

Write-Host "LOST lifecycle: OK"

Write-Host "13) FAIR return goes back to AVAILABLE with FAIR condition..."
$fairItem = CreateBook `
  "Sprint5B Fair Return $suffix" `
  $librarianHeaders

$fairCopy = CreateCopy `
  $fairItem.data.id `
  $mainBranch.id `
  "S5B-$suffix-FAIR" `
  $librarianHeaders

$fairBorrowing = Checkout `
  $studentGoodId `
  $fairCopy.data.id `
  $librarianHeaders

$fairReturn = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/borrowings/$($fairBorrowing.data.id)/return" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    outcome = "FAIR"
  } | ConvertTo-Json)

$fairCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($fairCopy.data.id)" `
  -Headers $librarianHeaders

if ($fairReturn.data.status -ne "RETURNED") {
  throw "FAIR return should be RETURNED"
}

if ($fairCopyAfter.data.status -ne "AVAILABLE") {
  throw "FAIR return should make copy AVAILABLE"
}

if ($fairCopyAfter.data.condition -ne "FAIR") {
  throw "FAIR return should set copy condition FAIR"
}

Write-Host "FAIR return lifecycle: OK"

Write-Host "14) Student and Management cannot process returns..."
$guardItem = CreateBook `
  "Sprint5B Return Guard $suffix" `
  $librarianHeaders

$guardCopy = CreateCopy `
  $guardItem.data.id `
  $mainBranch.id `
  "S5B-$suffix-GUARD" `
  $librarianHeaders

$guardBorrowing = Checkout `
  $studentGoodId `
  $guardCopy.data.id `
  $librarianHeaders

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/$($guardBorrowing.data.id)/return" `
    -Headers $studentGoodHeaders `
    -ContentType "application/json" `
    -Body (@{
      outcome = "GOOD"
    } | ConvertTo-Json)

  throw "Student return RBAC test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Student return RBAC: OK"
  } else {
    throw
  }
}

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/borrowings/$($guardBorrowing.data.id)/return" `
    -Headers $managementHeaders `
    -ContentType "application/json" `
    -Body (@{
      outcome = "GOOD"
    } | ConvertTo-Json)

  throw "Management return RBAC test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Management return RBAC: OK"
  } else {
    throw
  }
}

Write-Host "15) Operations detail reflects final lifecycle..."
$lostDetail = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/borrowings/$($lostBorrowing.data.id)" `
  -Headers $managementHeaders

if ($lostDetail.data.status -ne "LOST") {
  throw "Management detail did not preserve LOST state"
}

if ($lostDetail.data.copy.status -ne "LOST") {
  throw "Management detail did not show LOST copy state"
}

Write-Host "Operations lifecycle detail: OK"

Write-Host "16) Cleanup temporary circulation-policy fixture..."
& node `
  .\scripts\sprint5\sprint5a-policy-fixture.js `
  cleanup | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not cleanup Sprint 5 policy fixture"
}

Write-Host ""
Write-Host "Sprint 5B return + overdue smoke PASSED."
