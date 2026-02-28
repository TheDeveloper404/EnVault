param(
  [string]$ComposeFile = "infra/docker/docker-compose.yml",
  [string]$Service = "postgres",
  [string]$DbName = "envault",
  [string]$DbUser = "envault",
  [string]$OutputDir = "infra/backups",
  [int]$RetentionDays = 14,
  [int]$MinKeep = 5,
  [switch]$VerifyHealthAfterBackup
)

$ErrorActionPreference = "Stop"

if ($RetentionDays -lt 1) {
  throw "RetentionDays must be >= 1"
}

if ($MinKeep -lt 1) {
  throw "MinKeep must be >= 1"
}

$backupScript = "infra/scripts/db-backup.ps1"
if (-not (Test-Path $backupScript)) {
  throw "Backup script not found: $backupScript"
}

& $backupScript -ComposeFile $ComposeFile -Service $Service -DbName $DbName -DbUser $DbUser -OutputDir $OutputDir
if ($LASTEXITCODE -ne 0) {
  throw "Backup execution failed with exit code $LASTEXITCODE"
}

$backupFiles = Get-ChildItem -Path $OutputDir -Filter "envault-*.dump" -File | Sort-Object LastWriteTime -Descending
if (-not $backupFiles -or $backupFiles.Count -eq 0) {
  throw "No backup files found in $OutputDir after backup run"
}

$newestBackup = $backupFiles[0]
Write-Host "Latest backup: $($newestBackup.FullName)"

if ($VerifyHealthAfterBackup) {
  $healthScript = "infra/scripts/health-monitor.ps1"
  if (-not (Test-Path $healthScript)) {
    throw "Health monitor script not found: $healthScript"
  }

  & $healthScript -ApiBaseUrl "http://localhost:3093" -RequireMetrics
  if ($LASTEXITCODE -ne 0) {
    throw "Post-backup health verification failed"
  }
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
$protectedNames = $backupFiles | Select-Object -First $MinKeep | ForEach-Object { $_.Name }

$toDelete = $backupFiles | Where-Object {
  $_.LastWriteTime -lt $cutoff -and ($protectedNames -notcontains $_.Name)
}

$deletedCount = 0
foreach ($file in $toDelete) {
  Remove-Item -LiteralPath $file.FullName -Force
  $deletedCount += 1
}

Write-Host "Backup rotation completed. RetentionDays=$RetentionDays, MinKeep=$MinKeep, Deleted=$deletedCount"
