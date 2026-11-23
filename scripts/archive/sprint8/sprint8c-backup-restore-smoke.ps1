$ErrorActionPreference = "Stop"

$ContainerName =
  if ($env:SAMS_POSTGRES_CONTAINER) {
    $env:SAMS_POSTGRES_CONTAINER
  } else {
    "sams-postgres"
  }

$SourceDb =
  if ($env:SAMS_POSTGRES_DB) {
    $env:SAMS_POSTGRES_DB
  } else {
    "sams_library"
  }

$RestoreDb =
  "sams_library_rc_restore"

$DumpPath =
  "/tmp/sams_mvp_rc_backup.dump"

function Run-Docker {
  param(
    [Parameter(Mandatory=$true)]
    [string[]]$Args
  )

  & docker @Args

  if ($LASTEXITCODE -ne 0) {
    throw "Docker command failed: docker $($Args -join ' ')"
  }
}

function Query-Scalar {
  param(
    [Parameter(Mandatory=$true)]
    [string]$Database,

    [Parameter(Mandatory=$true)]
    [string]$Sql
  )

  $value =
    & docker exec `
      $ContainerName `
      psql `
      -U postgres `
      -d $Database `
      -At `
      -v ON_ERROR_STOP=1 `
      -c $Sql

  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL query failed on $Database"
  }

  return "$value".Trim()
}

Write-Host "========================================"
Write-Host "SAMS MVP RC PostgreSQL Backup/Restore Smoke"
Write-Host "========================================"
Write-Host ""

Write-Host "1) Verify PostgreSQL container + tooling..."
Run-Docker @(
  "inspect",
  $ContainerName
) | Out-Null

Run-Docker @(
  "exec",
  $ContainerName,
  "pg_dump",
  "--version"
)

Run-Docker @(
  "exec",
  $ContainerName,
  "pg_restore",
  "--version"
)

Write-Host "PostgreSQL backup tooling: OK"

try {
  Write-Host ""
  Write-Host "2) Capture source DB reconciliation counters..."

  $sourceUsers =
    Query-Scalar `
      $SourceDb `
      "SELECT COUNT(*) FROM users;"

  $sourceBranches =
    Query-Scalar `
      $SourceDb `
      "SELECT COUNT(*) FROM branches;"

  $sourceItems =
    Query-Scalar `
      $SourceDb `
      "SELECT COUNT(*) FROM library_items;"

  $sourceViews =
    Query-Scalar `
      $SourceDb `
      "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public';"

  $sourceTriggers =
    Query-Scalar `
      $SourceDb `
      "SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public';"

  Write-Host "Source reconciliation counters: OK"

  Write-Host ""
  Write-Host "3) Create custom-format backup..."

  Run-Docker @(
    "exec",
    $ContainerName,
    "rm",
    "-f",
    $DumpPath
  )

  Run-Docker @(
    "exec",
    $ContainerName,
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    $SourceDb,
    "-Fc",
    "-f",
    $DumpPath
  )

  Write-Host "Backup created: OK"

  Write-Host ""
  Write-Host "4) Create temporary restore database..."

  Run-Docker @(
    "exec",
    $ContainerName,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "DROP DATABASE IF EXISTS $RestoreDb WITH (FORCE);"
  )

  Run-Docker @(
    "exec",
    $ContainerName,
    "createdb",
    "-U",
    "postgres",
    $RestoreDb
  )

  Write-Host "Temporary restore DB created: OK"

  Write-Host ""
  Write-Host "5) Restore backup..."

  Run-Docker @(
    "exec",
    $ContainerName,
    "pg_restore",
    "-U",
    "postgres",
    "-d",
    $RestoreDb,
    "--exit-on-error",
    $DumpPath
  )

  Write-Host "Restore completed: OK"

  Write-Host ""
  Write-Host "6) Reconcile restored data + DB objects..."

  $restoreUsers =
    Query-Scalar `
      $RestoreDb `
      "SELECT COUNT(*) FROM users;"

  $restoreBranches =
    Query-Scalar `
      $RestoreDb `
      "SELECT COUNT(*) FROM branches;"

  $restoreItems =
    Query-Scalar `
      $RestoreDb `
      "SELECT COUNT(*) FROM library_items;"

  $restoreViews =
    Query-Scalar `
      $RestoreDb `
      "SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public';"

  $restoreTriggers =
    Query-Scalar `
      $RestoreDb `
      "SELECT COUNT(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public';"

  if ($sourceUsers -ne $restoreUsers) {
    throw "Backup/restore users mismatch: $sourceUsers vs $restoreUsers"
  }

  if ($sourceBranches -ne $restoreBranches) {
    throw "Backup/restore branches mismatch: $sourceBranches vs $restoreBranches"
  }

  if ($sourceItems -ne $restoreItems) {
    throw "Backup/restore library_items mismatch: $sourceItems vs $restoreItems"
  }

  if ($sourceViews -ne $restoreViews) {
    throw "Backup/restore views mismatch: $sourceViews vs $restoreViews"
  }

  if ($sourceTriggers -ne $restoreTriggers) {
    throw "Backup/restore triggers mismatch: $sourceTriggers vs $restoreTriggers"
  }

  Write-Host "Row-count reconciliation: OK"
  Write-Host "Views/triggers reconciliation: OK"
  Write-Host ""
  Write-Host "Sprint 8C PostgreSQL backup/restore smoke PASSED."
}
finally {
  Write-Host ""
  Write-Host "7) Cleanup temporary restore artifacts..."

  & docker exec `
    $ContainerName `
    psql `
    -U postgres `
    -d postgres `
    -c "DROP DATABASE IF EXISTS $RestoreDb WITH (FORCE);" `
    | Out-Null

  & docker exec `
    $ContainerName `
    rm `
    -f `
    $DumpPath `
    | Out-Null

  Write-Host "Temporary restore DB/dump cleanup attempted."
}
