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

function CreateReservation($itemId, $branchId, $headers) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      itemId = $itemId
      branchId = $branchId
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
Write-Host "Policy fixture: OK"

Write-Host "2) Login as Librarian + Student..."
$librarian = DevLogin "librarian@sams.dev"
$librarianHeaders = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

$student = DevLogin "student@sams.dev"
$studentHeaders = @{
  Authorization = "Bearer $($student.accessToken)"
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

Write-Host "4) Student cancellation releases copy..."
$studentCancelItem = CreateBook `
  "Sprint4B Student Cancel $suffix" `
  $librarianHeaders

$studentCancelCopy = CreateCopy `
  $studentCancelItem.data.id `
  $mainBranch.id `
  "S4B-$suffix-STUDENT" `
  $librarianHeaders

$studentCancelReservation = CreateReservation `
  $studentCancelItem.data.id `
  $mainBranch.id `
  $studentHeaders

$cancelled = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations/$($studentCancelReservation.data.id)/cancel" `
  -Headers $studentHeaders

if ($cancelled.data.status -ne "CANCELLED") {
  throw "Student cancellation did not produce CANCELLED"
}

if (-not $cancelled.data.cancelledAt) {
  throw "Student cancellation is missing cancelledAt"
}

$studentCancelCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($studentCancelCopy.data.id)" `
  -Headers $librarianHeaders

if ($studentCancelCopyAfter.data.status -ne "AVAILABLE") {
  throw "Student cancellation did not release the copy"
}

Write-Host "Student cancel + copy release: OK"

Write-Host "5) Repeating cancellation is idempotent..."
$cancelledAgain = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations/$($studentCancelReservation.data.id)/cancel" `
  -Headers $studentHeaders

if ($cancelledAgain.data.status -ne "CANCELLED") {
  throw "Repeated cancellation changed the final state"
}

Write-Host "Repeated cancel: OK"

Write-Host "6) Librarian can cancel an active student reservation..."
$librarianCancelItem = CreateBook `
  "Sprint4B Librarian Cancel $suffix" `
  $librarianHeaders

$librarianCancelCopy = CreateCopy `
  $librarianCancelItem.data.id `
  $mainBranch.id `
  "S4B-$suffix-LIB" `
  $librarianHeaders

$librarianCancelReservation = CreateReservation `
  $librarianCancelItem.data.id `
  $mainBranch.id `
  $studentHeaders

$librarianCancelled = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations/$($librarianCancelReservation.data.id)/cancel" `
  -Headers $librarianHeaders

if ($librarianCancelled.data.status -ne "CANCELLED") {
  throw "Librarian cancellation failed"
}

$librarianCancelCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($librarianCancelCopy.data.id)" `
  -Headers $librarianHeaders

if ($librarianCancelCopyAfter.data.status -ne "AVAILABLE") {
  throw "Librarian cancellation did not release copy"
}

Write-Host "Librarian cancel + copy release: OK"

Write-Host "7) MANAGEMENT must not cancel reservations..."
$managementItem = CreateBook `
  "Sprint4B Management Guard $suffix" `
  $librarianHeaders

$managementCopy = CreateCopy `
  $managementItem.data.id `
  $mainBranch.id `
  "S4B-$suffix-MGMT" `
  $librarianHeaders

$managementReservation = CreateReservation `
  $managementItem.data.id `
  $mainBranch.id `
  $studentHeaders

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations/$($managementReservation.data.id)/cancel" `
    -Headers $managementHeaders

  throw "Management cancellation should not be allowed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -in @(403, 404)) {
    Write-Host "Management cancellation guard: OK"
  } else {
    throw
  }
}

Write-Host "8) Create reservation that will become due..."
$expireItem = CreateBook `
  "Sprint4B Expiration $suffix" `
  $librarianHeaders

$expireCopy = CreateCopy `
  $expireItem.data.id `
  $mainBranch.id `
  "S4B-$suffix-EXPIRE" `
  $librarianHeaders

$expireReservation = CreateReservation `
  $expireItem.data.id `
  $mainBranch.id `
  $studentHeaders

Write-Host "9) Force smoke reservation into past-due state..."
& node `
  .\scripts\sprint4\sprint4b-force-due.js `
  $expireReservation.data.id | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not force reservation due"
}

Write-Host "Past-due fixture: OK"

Write-Host "10) Student cannot run expiration worker..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations/expire-due?limit=100" `
    -Headers $studentHeaders

  throw "Student expiration worker RBAC test failed"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Expiration worker RBAC: OK"
  } else {
    throw
  }
}

Write-Host "11) Librarian expires due reservations..."
$expirationResult = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations/expire-due?limit=100" `
  -Headers $librarianHeaders

if ($expirationResult.data.expiredCount -lt 1) {
  throw "Expected at least one due reservation to expire"
}

Write-Host "Expired count:" $expirationResult.data.expiredCount

Write-Host "12) Expired reservation appears in student history..."
$expiredMine = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations/me?status=EXPIRED&pageSize=100" `
  -Headers $studentHeaders

$expiredCurrent = $expiredMine.data |
  Where-Object { $_.id -eq $expireReservation.data.id } |
  Select-Object -First 1

if (-not $expiredCurrent) {
  throw "Expired reservation missing from student history"
}

Write-Host "Expired history state: OK"

Write-Host "13) Expiration automatically releases copy..."
$expireCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($expireCopy.data.id)" `
  -Headers $librarianHeaders

if ($expireCopyAfter.data.status -ne "AVAILABLE") {
  throw "Expiration did not release the allocated copy"
}

Write-Host "EXPIRED -> copy AVAILABLE: OK"

Write-Host "14) Expired reservation cannot be cancelled..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations/$($expireReservation.data.id)/cancel" `
    -Headers $studentHeaders

  throw "Expired cancellation should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Expired terminal-state protection: OK"
  } else {
    throw
  }
}

Write-Host "15) Reservation responses still hide raw copy identity..."
$historyJson = $expiredMine | ConvertTo-Json -Depth 20

if ($historyJson -match [regex]::Escape($expireCopy.data.id)) {
  throw "Reservation history leaked PhysicalCopy.id"
}

if ($historyJson -match "allocatedCopyId") {
  throw "Reservation history leaked allocatedCopyId"
}

Write-Host "Reservation privacy boundary: OK"

Write-Host "16) Cleanup temporary reservation policy fixture..."
& node `
  .\scripts\sprint4\sprint4a-policy-fixture.js `
  cleanup | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not cleanup policy fixture"
}

Write-Host ""
Write-Host "Sprint 4B cancellation + expiration smoke PASSED."
