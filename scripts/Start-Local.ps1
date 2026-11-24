param(
  [switch]$Restart,
  [string]$RuntimePath = 'D:\Digi\SAMS_Library_System_Root\SAMS_Book_RAG_Runtime_10D3',
  [string]$ResearchCredentialPath = 'D:\Digi\SAMS_Library_System_Root\sams-demo-20261110\research-postgres.clixml'
)
$ErrorActionPreference = 'Stop'
$book = Import-Clixml -LiteralPath (Join-Path $RuntimePath 'credentials/book-rag-postgres.clixml')
$research = Import-Clixml -LiteralPath $ResearchCredentialPath
if ($book.Username -ne 'sams_book_rag_ro' -or $book.Database -ne 'sams_library' -or $research.UserName -ne 'sams_research_rag_ro') {
  throw 'Unexpected local read-only credentials.'
}
$nodeLauncher = (Join-Path $PSScriptRoot 'start-local.mjs').Replace('\', '/')
if ($Restart) {
  $previousLaunchers = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.Replace('\', '/').Contains($nodeLauncher)
  })
  foreach ($previousLauncher in $previousLaunchers) {
    Write-Host "Stopping previous SAMS local launcher (PID $($previousLauncher.ProcessId))..."
    Stop-Process -Id $previousLauncher.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
$secretInput = @{
  bookPassword = [Net.NetworkCredential]::new('', $book.Password).Password
  researchPassword = $research.GetNetworkCredential().Password
  models = (Join-Path $RuntimePath 'models')
} | ConvertTo-Json -Compress
try {
  $secretInput | node (Join-Path $PSScriptRoot 'start-local.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Local runtime stopped unsuccessfully.' }
} finally {
  $secretInput = $null
  $book = $null
  $research = $null
}
