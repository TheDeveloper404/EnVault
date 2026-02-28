param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$ComposeFile = "infra/docker/docker-compose.yml",
  [string]$Service = "postgres",
  [string]$DbName = "envault",
  [string]$DbUser = "envault"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker command not found. Install Docker Desktop and ensure it is available in PATH."
}

if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}

if (-not (Test-Path $BackupFile)) {
  throw "Backup file not found: $BackupFile"
}

$backupBaseName = Split-Path -Path $BackupFile -Leaf
$containerTmpFile = "/tmp/$backupBaseName"

Write-Host "Restoring backup $BackupFile into database '$DbName' ..."
Write-Host "WARNING: this operation will drop and recreate the target database."

# Drop and recreate DB to ensure a clean restore target

docker compose -f $ComposeFile exec -T $Service psql -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $DbName;"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to drop database '$DbName'"
}

docker compose -f $ComposeFile exec -T $Service psql -U $DbUser -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DbName;"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create database '$DbName'"
}

$containerId = (docker compose -f $ComposeFile ps -q $Service).Trim()
if (-not $containerId) {
  throw "Could not resolve container id for service '$Service'"
}

docker cp $BackupFile "$containerId`:$containerTmpFile"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy backup into container"
}

docker compose -f $ComposeFile exec -T $Service pg_restore -U $DbUser -d $DbName --clean --if-exists --no-owner --no-privileges $containerTmpFile
if ($LASTEXITCODE -ne 0) {
  throw "Restore failed with exit code $LASTEXITCODE"
}

docker compose -f $ComposeFile exec -T $Service rm -f $containerTmpFile | Out-Null

Write-Host "Restore completed successfully into database '$DbName'."
