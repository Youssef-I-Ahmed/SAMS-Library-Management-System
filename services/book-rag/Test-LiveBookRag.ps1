param(
  [Parameter(Mandatory=$true)][string]$CredentialPath,
  [Parameter(Mandatory=$true)][string]$ModelsPath,
  [Parameter(Mandatory=$true)][string]$EvidencePath
)
$ErrorActionPreference = 'Stop'
$credential = Import-Clixml -LiteralPath $CredentialPath
if ($credential.Username -ne 'sams_book_rag_ro' -or $credential.Database -ne 'sams_library') { throw 'Unexpected database credential principal/target.' }
$previousModels = $env:BOOK_RAG_MODELS_HOST_PATH
$previousEvidence = $env:BOOK_RAG_EVIDENCE_DIR
try {
  $env:BOOK_RAG_MODELS_HOST_PATH = (Resolve-Path -LiteralPath $ModelsPath).Path
  $env:BOOK_RAG_EVIDENCE_DIR = [IO.Path]::GetFullPath($EvidencePath)
  $secretInput = @{ BOOK_RAG_PGPASSWORD=([Net.NetworkCredential]::new('', $credential.Password)).Password } | ConvertTo-Json -Compress
  $secretInput | node (Join-Path $PSScriptRoot 'tests/live-runtime.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Live verification failed; inspect the sanitized evidence.' }
} finally {
  $secretInput = $null
  $credential = $null
  $env:BOOK_RAG_MODELS_HOST_PATH = $previousModels
  $env:BOOK_RAG_EVIDENCE_DIR = $previousEvidence
}
