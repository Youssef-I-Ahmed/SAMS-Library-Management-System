$ErrorActionPreference = 'Stop'

$folder = Join-Path ([IO.Path]::GetPathRoot($PSScriptRoot)) 'SAMS_Backups'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$containerPath = "/tmp/sams_before_academic_works_$stamp.dump"
$destination = Join-Path $folder "sams_before_academic_works_$stamp.dump"

Write-Host 'Creating PostgreSQL backup before the academic-work migration...'
& docker exec sams-postgres pg_dump -U postgres -d sams_library -Fc -f $containerPath
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed. Do not migrate or import.' }

& docker cp "sams-postgres:$containerPath" "$destination"
if ($LASTEXITCODE -ne 0) { throw 'docker cp failed. Do not migrate or import.' }

$file = Get-Item -LiteralPath $destination -ErrorAction Stop
if ($file.Length -lt 1024) { throw 'Backup looks too small. Do not migrate or import.' }

& docker exec sams-postgres pg_restore --list $containerPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not validate the backup archive.' }

Write-Host ("BACKUP VERIFIED: " + $file.FullName + " (" + $file.Length + " bytes)")
& docker exec sams-postgres rm -f $containerPath
if ($LASTEXITCODE -ne 0) {
  Write-Warning 'The verified Windows backup is preserved; only the container temporary file remains.'
}
