param(
  [Parameter(Mandatory = $true)]
  [string]$Path
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $Path)) {
  throw "CSV file not found: $Path"
}

function Convert-ToBool($value) {
  if ([string]::IsNullOrWhiteSpace($value)) { return $true }
  return $value.Trim().ToLowerInvariant() -eq "true"
}

$login = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/auth/dev-login" `
  -ContentType "application/json" `
  -Body (@{ universityEmail = "librarian@sams.dev" } | ConvertTo-Json)

$headers = @{ Authorization = "Bearer $($login.accessToken)" }
$rows = Import-Csv $Path

if ($rows.Count -eq 0) { throw "CSV contains no student rows." }

$students = @(
  foreach ($row in $rows) {
    @{
      studentId = $row.studentId
      universityEmail = $row.universityEmail
      displayName = $row.displayName
      facultyName = if ([string]::IsNullOrWhiteSpace($row.facultyName)) { $null } else { $row.facultyName }
      departmentName = if ([string]::IsNullOrWhiteSpace($row.departmentName)) { $null } else { $row.departmentName }
      academicStatus = if ([string]::IsNullOrWhiteSpace($row.academicStatus)) { "ACTIVE" } else { $row.academicStatus }
      isActive = Convert-ToBool $row.isActive
    }
  }
)

$payload = @{ students = $students } | ConvertTo-Json -Depth 6

$result = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/students/import" `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $payload

$result | ConvertTo-Json -Depth 8
