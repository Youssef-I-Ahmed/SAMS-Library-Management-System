# No destructive operations. Saves a binary PostgreSQL custom-format backup
# from sams-postgres to D:\SAMS_Backups (outside Git repository).
$ErrorActionPreference = 'Stop'
$folder = 'D:\SAMS_Backups'
New-Item -ItemType Directory -Force -Path $folder | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$containerPath = "/tmp/sams_before_books_demo_$stamp.dump"
$destination = Join-Path $folder "sams_before_books_demo_$stamp.dump"

Write-Host 'Creating database backup inside sams-postgres...'
& docker exec sams-postgres pg_dump -U postgres -d sams_library -Fc -f $containerPath
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed. No import should run.' }
& docker cp "sams-postgres:$containerPath" "$destination"
if ($LASTEXITCODE -ne 0) { throw 'docker cp failed. No import should run.' }

$file = Get-Item -LiteralPath $destination -ErrorAction Stop
if ($file.Length -lt 1024) { throw 'Backup looks too small. No import should run.' }
Write-Host 'Validating archive contents...'
& docker exec sams-postgres pg_restore --list $containerPath | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not list backup. No import should run.' }
Write-Host ("BACKUP VERIFIED: " + $file.FullName + " (" + $file.Length + " bytes)")
& docker exec sams-postgres rm -f $containerPath
if ($LASTEXITCODE -ne 0) { Write-Warning 'Temporary backup remains inside container; the Windows backup is preserved.' }
