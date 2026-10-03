$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "1) Login as Student..."
$student = DevLogin "student@sams.dev"
$studentHeaders = @{
  Authorization = "Bearer $($student.accessToken)"
}

Write-Host "2) Student must NOT access raw inventory..."
try {
  Invoke-RestMethod `
    -Method Get `
    -Uri "http://localhost:4000/api/v1/inventory/copies" `
    -Headers $studentHeaders

  throw "RBAC TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "RBAC OK."
  } else { throw }
}

Write-Host "3) Login as Librarian..."
$librarian = DevLogin "librarian@sams.dev"
$headers = @{
  Authorization = "Bearer $($librarian.accessToken)"
}

Write-Host "4) Resolve MAIN branch..."
$branches = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/master-data/branches" `
  -Headers $headers

$mainBranch = $branches.data |
  Where-Object { $_.code -eq "MAIN" } |
  Select-Object -First 1

if (-not $mainBranch) {
  throw "MAIN branch not found"
}

Write-Host "5) Create LibraryItem..."
$item = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint2D Inventory Book $suffix"
    callNumber = "004 / S2D-$suffix"
  } | ConvertTo-Json)

Write-Host "6) Create PhysicalCopy..."
$copy = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/inventory/copies" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    itemId = $item.data.id
    branchId = $mainBranch.id
    copyCode = "S2D-$suffix-01"
    barcode = "S2D-BAR-$suffix"
    shelfLocation = "Shelf DEV-01"
    condition = "GOOD"
  } | ConvertTo-Json)

Write-Host "Copy status:" $copy.data.status
Write-Host "Copy version:" $copy.data.version

if ($copy.data.status -ne "AVAILABLE") {
  throw "Default copy status should be AVAILABLE"
}

Write-Host "7) Search inventory by copy code..."
$search = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies?search=S2D-$suffix-01" `
  -Headers $headers

if ($search.pagination.total -ne 1) {
  throw "Inventory search failed"
}

Write-Host "Inventory search: OK"

Write-Host "8) Update shelf location + status..."
$updated = Invoke-RestMethod `
  -Method Patch `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($copy.data.id)" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    version = $copy.data.version
    shelfLocation = "Shelf DEV-02"
    status = "UNAVAILABLE"
  } | ConvertTo-Json)

Write-Host "Updated status:" $updated.data.status
Write-Host "Updated version:" $updated.data.version

Write-Host "9) Stale copy update must fail..."
try {
  Invoke-RestMethod `
    -Method Patch `
    -Uri "http://localhost:4000/api/v1/inventory/copies/$($copy.data.id)" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $copy.data.version
      shelfLocation = "STALE"
    } | ConvertTo-Json)

  throw "OPTIMISTIC LOCK TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Optimistic locking OK."
  } else { throw }
}

Write-Host "10) Manual RESERVED status must be rejected..."
try {
  Invoke-RestMethod `
    -Method Patch `
    -Uri "http://localhost:4000/api/v1/inventory/copies/$($copy.data.id)" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $updated.data.version
      status = "RESERVED"
    } | ConvertTo-Json)

  throw "CIRCULATION STATUS TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Circulation-owned status protection OK."
  } else { throw }
}

Write-Host "11) Duplicate barcode must be rejected..."
try {
  Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/inventory/copies" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      itemId = $item.data.id
      branchId = $mainBranch.id
      copyCode = "S2D-$suffix-02"
      barcode = "S2D-BAR-$suffix"
    } | ConvertTo-Json)

  throw "BARCODE UNIQUENESS TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Barcode uniqueness OK."
  } else { throw }
}

Write-Host "12) Management can read but cannot modify..."
$management = DevLogin "management@sams.dev"
$managementHeaders = @{
  Authorization = "Bearer $($management.accessToken)"
}

$managementView = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/inventory/copies/$($copy.data.id)" `
  -Headers $managementHeaders

Write-Host "Management read:" $managementView.data.copyCode

try {
  Invoke-RestMethod `
    -Method Patch `
    -Uri "http://localhost:4000/api/v1/inventory/copies/$($copy.data.id)" `
    -Headers $managementHeaders `
    -ContentType "application/json" `
    -Body (@{
      version = $updated.data.version
      shelfLocation = "SHOULD NOT UPDATE"
    } | ConvertTo-Json)

  throw "MANAGEMENT RBAC TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 403) {
    Write-Host "Management read-only RBAC OK."
  } else { throw }
}

Write-Host ""
Write-Host "Sprint 2D smoke test PASSED."
