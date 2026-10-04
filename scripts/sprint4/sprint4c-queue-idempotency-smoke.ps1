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
& node `
  .\scripts\sprint4\sprint4a-policy-fixture.js `
  create | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not create policy fixture"
}

Write-Host "2) Login as Student, Librarian, Management..."
$student = DevLogin "student@sams.dev"
$studentHeaders = @{
  Authorization = "Bearer $($student.accessToken)"
}

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

Write-Host "4) Create reservable item + copy..."
$item = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint4C Queue Book $suffix"
    callNumber = "S4C / $suffix"
  } | ConvertTo-Json)

$copy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $item.data.id
    branchId = $mainBranch.id
    copyCode = "S4C-$suffix-01"
    barcode = "S4C-BAR-$suffix-01"
    shelfLocation = "S4C Shelf"
    status = "AVAILABLE"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "5) Create reservation with Idempotency-Key..."
$idempotencyKey = "s4c-$suffix-create-01"

$createHeaders = @{
  Authorization = "Bearer $($student.accessToken)"
  "Idempotency-Key" = $idempotencyKey
}

$body = @{
  itemId = $item.data.id
  branchId = $mainBranch.id
} | ConvertTo-Json

$first = Invoke-WebRequest `
  -UseBasicParsing `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations" `
  -Headers $createHeaders `
  -ContentType "application/json" `
  -Body $body

if ($first.StatusCode -ne 201) {
  throw "First idempotent request should return 201"
}

$firstBody = $first.Content | ConvertFrom-Json
$firstReservationId = $firstBody.data.id

if ($first.Headers["Idempotency-Replayed"] -ne "false") {
  throw "First request should not be marked replayed"
}

Write-Host "First reservation:" $firstReservationId

Write-Host "6) Replay exact same request/key..."
$second = Invoke-WebRequest `
  -UseBasicParsing `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/reservations" `
  -Headers $createHeaders `
  -ContentType "application/json" `
  -Body $body

$secondBody = $second.Content | ConvertFrom-Json

if ($second.StatusCode -ne 201) {
  throw "Idempotent replay should return original success status"
}

if ($secondBody.data.id -ne $firstReservationId) {
  throw "Idempotent replay returned a different reservation"
}

if ($second.Headers["Idempotency-Replayed"] -ne "true") {
  throw "Replay response should be marked replayed"
}

Write-Host "Idempotent replay: OK"

Write-Host "7) Same key with different payload must fail..."
$otherItem = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint4C Other Book $suffix"
  } | ConvertTo-Json)

$otherCopy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $librarianHeaders `
  -ContentType "application/json" `
  -Body (@{
    itemId = $otherItem.data.id
    branchId = $mainBranch.id
    copyCode = "S4C-$suffix-02"
    barcode = "S4C-BAR-$suffix-02"
    status = "AVAILABLE"
  } | ConvertTo-Json)

try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/reservations" `
    -Headers $createHeaders `
    -ContentType "application/json" `
    -Body (@{
      itemId = $otherItem.data.id
      branchId = $mainBranch.id
    } | ConvertTo-Json)

  throw "Reusing key with different payload should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Idempotency key reuse protection: OK"
  } else {
    throw
  }
}

$otherCopyAfter = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($otherCopy.data.id)" `
  -Headers $librarianHeaders

if ($otherCopyAfter.data.status -ne "AVAILABLE") {
  throw "Rejected idempotency-key reuse touched the other copy"
}

Write-Host "Rejected replay left inventory unchanged: OK"

Write-Host "8) Student cannot read global reservation queue..."
try {
  Invoke-RestMethod `
    -Method Get `
    -Uri "http://localhost:4000/api/v1/reservations" `
    -Headers $studentHeaders

  throw "Student global queue access should fail"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Queue RBAC: OK"
  } else {
    throw
  }
}

Write-Host "9) Librarian searches queue by item title..."
$q = [uri]::EscapeDataString("Sprint4C Queue Book $suffix")

$queue = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations?q=$q&status=ACTIVE&branchId=$($mainBranch.id)" `
  -Headers $librarianHeaders

$current = $queue.data |
  Where-Object { $_.id -eq $firstReservationId } |
  Select-Object -First 1

if (-not $current) {
  throw "Reservation missing from librarian queue"
}

if ($current.student.user.universityEmail -ne "student@sams.dev") {
  throw "Queue student lookup data missing"
}

if ($current.item.id -ne $item.data.id) {
  throw "Queue item mismatch"
}

if ($current.branch.id -ne $mainBranch.id) {
  throw "Queue branch mismatch"
}

if ($current.allocatedCopy.id -ne $copy.data.id) {
  throw "Librarian queue should expose operational allocated copy"
}

Write-Host "Librarian queue + operational copy data: OK"

Write-Host "10) Search queue by student email..."
$emailQuery = [uri]::EscapeDataString("student@sams.dev")

$studentLookup = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations?q=$emailQuery&pageSize=100" `
  -Headers $librarianHeaders

$studentMatch = $studentLookup.data |
  Where-Object { $_.id -eq $firstReservationId } |
  Select-Object -First 1

if (-not $studentMatch) {
  throw "Student email lookup did not find reservation"
}

Write-Host "Student lookup: OK"

Write-Host "11) Validate queue filter/pagination metadata..."
if ($queue.meta.appliedFilters.status -ne "ACTIVE") {
  throw "Queue status filter metadata mismatch"
}

if ($queue.meta.appliedFilters.branchId -ne $mainBranch.id) {
  throw "Queue branch filter metadata mismatch"
}

if ($queue.pagination.page -ne 1) {
  throw "Queue pagination metadata mismatch"
}

Write-Host "Queue metadata: OK"

Write-Host "12) Librarian opens reservation detail..."
$detail = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations/$firstReservationId" `
  -Headers $librarianHeaders

if ($detail.data.id -ne $firstReservationId) {
  throw "Reservation detail mismatch"
}

if ($detail.data.student.user.universityEmail -ne "student@sams.dev") {
  throw "Reservation detail missing student identity"
}

if ($detail.data.allocatedCopy.id -ne $copy.data.id) {
  throw "Reservation detail missing allocated copy"
}

if ($detail.data.allocatedCopy.shelfLocation -ne "S4C Shelf") {
  throw "Reservation detail missing operational shelf location"
}

Write-Host "Librarian reservation detail: OK"

Write-Host "13) Management has read-only queue/detail access..."
$managementQueue = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations?q=$q" `
  -Headers $managementHeaders

if (-not ($managementQueue.data | Where-Object { $_.id -eq $firstReservationId })) {
  throw "Management queue read failed"
}

$managementDetail = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations/$firstReservationId" `
  -Headers $managementHeaders

if ($managementDetail.data.id -ne $firstReservationId) {
  throw "Management detail read failed"
}

Write-Host "Management read-only visibility: OK"

Write-Host "14) Student history still hides raw allocated copy..."
$mine = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/reservations/me?status=ACTIVE&pageSize=100" `
  -Headers $studentHeaders

$mineJson = $mine | ConvertTo-Json -Depth 30

if ($mineJson -match [regex]::Escape($copy.data.id)) {
  throw "Student reservation history leaked PhysicalCopy.id"
}

if ($mineJson -match [regex]::Escape("S4C-BAR-$suffix-01")) {
  throw "Student reservation history leaked barcode"
}

if ($mineJson -match "allocatedCopy") {
  throw "Student reservation history leaked allocatedCopy"
}

Write-Host "Student/internal privacy boundary: OK"

Write-Host "15) Cleanup temporary reservation policy fixture..."
& node `
  .\scripts\sprint4\sprint4a-policy-fixture.js `
  cleanup | Out-Null

if ($LASTEXITCODE -ne 0) {
  throw "Could not cleanup policy fixture"
}

Write-Host ""
Write-Host "Sprint 4C queue + idempotency smoke PASSED."
