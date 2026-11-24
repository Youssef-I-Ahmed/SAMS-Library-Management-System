$ErrorActionPreference = "Stop"

Write-Host "0) Health check..."
$health = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/health"

Write-Host "API:" $health.status "- Database:" $health.database
Write-Host ""

$body = @{
  universityEmail = "student@sams.dev"
} | ConvertTo-Json

Write-Host "1) Development login..."
$login = Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:4000/api/v1/auth/dev-login" `
  -ContentType "application/json" `
  -Body $body

Write-Host "Logged in as:" $login.user.displayName
Write-Host "Roles:" ($login.user.roles -join ", ")
Write-Host ""

Write-Host "2) Calling /auth/me..."
$headers = @{
  Authorization = "Bearer $($login.accessToken)"
}

$me = Invoke-RestMethod `
  -Method Get `
  -Uri "http://localhost:4000/api/v1/auth/me" `
  -Headers $headers

$me | ConvertTo-Json -Depth 6
