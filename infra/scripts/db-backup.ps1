param(
  [string]$ComposeFile = "infra/docker/docker-compose.yml",
  [string]$Service = "postgres",
  [string]$DbName = "envault",
  [string]$DbUser = "envault",
  [string]$OutputDir = "infra/backups"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "docker command not found. Install Docker Desktop and ensure it is available in PATH."
}

if (-not (Test-Path $ComposeFile)) {
  throw "Compose file not found: $ComposeFile"
}

if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupFile = Join-Path $OutputDir "envault-$timestamp.dump"
$containerTmpFile = "/tmp/envault-backup-$timestamp.dump"

Write-Host "Creating backup to $backupFile ..."

docker compose -f $ComposeFile exec -T $Service sh -c "pg_dump -U $DbUser -d $DbName -Fc -f $containerTmpFile"

if ($LASTEXITCODE -ne 0) {
  throw "Backup failed with exit code $LASTEXITCODE"
}

$containerId = (docker compose -f $ComposeFile ps -q $Service).Trim()
if (-not $containerId) {
  throw "Could not resolve container id for service '$Service'"
}

docker cp "$containerId`:$containerTmpFile" $backupFile

if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy backup from container"
}

docker compose -f $ComposeFile exec -T $Service rm -f $containerTmpFile | Out-Null

Write-Host "Backup completed: $backupFile"
