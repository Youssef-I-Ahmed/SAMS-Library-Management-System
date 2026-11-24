$ErrorActionPreference = "Stop"

function DevLogin($email) {
  return Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:4000/api/v1/auth/dev-login" `
    -ContentType "application/json" `
    -Body (@{ universityEmail = $email } | ConvertTo-Json)
}

Write-Host "1) Login as Librarian..."
$librarian = DevLogin "librarian@sams.dev"
$headers = @{ Authorization = "Bearer $($librarian.accessToken)" }
$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

Write-Host "2) Create BOOK..."
$book = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    type = "BOOK"
    title = "Sprint2B Book $suffix"
    deweyCodeRaw = "004"
  } | ConvertTo-Json)

Write-Host "Book version:" $book.data.version

Write-Host "3) Upsert BookDetails..."
$bookWithDetails = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/book-details" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    version = $book.data.version
    isbn = "978-$suffix"
    publisher = "Sprint2B Publisher"
    edition = "1st"
  } | ConvertTo-Json)

if ($bookWithDetails.data.bookDetails.publisher -ne "Sprint2B Publisher") {
  throw "BookDetails test failed"
}

Write-Host "BookDetails attached. New version:" $bookWithDetails.data.version

Write-Host "4) Stale BookDetails update must fail..."
try {
  Invoke-RestMethod `
    -Method Put `
    -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/book-details" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $book.data.version
      publisher = "STALE"
    } | ConvertTo-Json)

  throw "STALE VERSION TEST FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Optimistic locking OK."
  } else { throw }
}

Write-Host "5) BOOK must reject AcademicWorkDetails..."
try {
  Invoke-RestMethod `
    -Method Put `
    -Uri "http://localhost:4000/api/v1/catalog/items/$($book.data.id)/academic-work-details" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $bookWithDetails.data.version
      academicYear = "2025/2026"
    } | ConvertTo-Json)

  throw "TYPE VALIDATION FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Type protection OK."
  } else { throw }
}

Write-Host "6) Resolve DEV Faculty + Department..."
$faculties = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/master-data/faculties" `
  -Headers $headers

$devFaculty = $faculties.data | Where-Object { $_.name -eq "DEV Faculty" } | Select-Object -First 1

if (-not $devFaculty) {
  throw "DEV Faculty not found"
}

$departments = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/master-data/departments?facultyId=$($devFaculty.id)" `
  -Headers $headers

$devDepartment = $departments.data | Where-Object { $_.name -eq "DEV Department" } | Select-Object -First 1

if (-not $devDepartment) {
  throw "DEV Department not found"
}

Write-Host "7) Create THESIS..."
$thesis = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/catalog/items" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    type = "THESIS"
    title = "Sprint2B Thesis $suffix"
    language = "English"
  } | ConvertTo-Json)

Write-Host "8) Upsert AcademicWorkDetails..."
$thesisWithDetails = Invoke-RestMethod `
  -Method Put `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($thesis.data.id)/academic-work-details" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body (@{
    version = $thesis.data.version
    facultyId = $devFaculty.id
    departmentId = $devDepartment.id
    academicYear = "2025/2026"
  } | ConvertTo-Json)

if ($thesisWithDetails.data.academicWorkDetails.workType -ne "THESIS") {
  throw "Academic workType was not derived correctly"
}

if ($thesisWithDetails.data.academicWorkDetails.department.name -ne "DEV Department") {
  throw "Academic department mapping failed"
}

Write-Host "AcademicWorkDetails attached."
Write-Host "workType:" $thesisWithDetails.data.academicWorkDetails.workType
Write-Host "Faculty:" $thesisWithDetails.data.academicWorkDetails.faculty.name
Write-Host "Department:" $thesisWithDetails.data.academicWorkDetails.department.name

Write-Host "9) THESIS must reject BookDetails..."
try {
  Invoke-RestMethod `
    -Method Put `
    -Uri "http://localhost:4000/api/v1/catalog/items/$($thesis.data.id)/book-details" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body (@{
      version = $thesisWithDetails.data.version
      isbn = "INVALID"
    } | ConvertTo-Json)

  throw "TYPE VALIDATION FAILED"
}
catch {
  if ($_.Exception.Response.StatusCode.value__ -eq 409) {
    Write-Host "Reverse type protection OK."
  } else { throw }
}

Write-Host "10) Student can read combined details..."
$student = DevLogin "student@sams.dev"
$studentHeaders = @{ Authorization = "Bearer $($student.accessToken)" }

$studentView = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/catalog/items/$($thesis.data.id)" `
  -Headers $studentHeaders

if ($studentView.data.academicWorkDetails.academicYear -ne "2025/2026") {
  throw "Student detail view failed"
}

Write-Host "Combined detail view: OK"
Write-Host ""
Write-Host "Sprint 2B smoke test PASSED."
