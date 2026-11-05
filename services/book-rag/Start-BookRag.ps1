param(
  [Parameter(Mandatory=$true)][string]$CredentialPath,
  [Parameter(Mandatory=$true)][string]$ModelsPath
)
$ErrorActionPreference = 'Stop'
# RAG_SERVICE_KEY is supplied in the calling server process environment, never a command argument/file.
if (!$env:RAG_SERVICE_KEY -or $env:RAG_SERVICE_KEY.Length -lt 32) { throw 'RAG_SERVICE_KEY is required (at least 32 characters).' }
$credential = Import-Clixml -LiteralPath $CredentialPath
if ($credential.Username -ne 'sams_book_rag_ro' -or $credential.Database -ne 'sams_library') { throw 'Unexpected database credential principal/target.' }
$previousModels = $env:BOOK_RAG_MODELS_HOST_PATH
try {
  $env:BOOK_RAG_MODELS_HOST_PATH = (Resolve-Path -LiteralPath $ModelsPath).Path
  $secretInput = @{ BOOK_RAG_PGPASSWORD=([Net.NetworkCredential]::new('', $credential.Password)).Password; API_SERVICE_KEY=$env:RAG_SERVICE_KEY } | ConvertTo-Json -Compress
  $secretInput | node (Join-Path $PSScriptRoot 'run-container.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Book RAG runtime exited unsuccessfully.' }
} finally {
  $secretInput = $null
  $credential = $null
  $env:BOOK_RAG_MODELS_HOST_PATH = $previousModels
}
