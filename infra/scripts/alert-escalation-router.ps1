param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("SEV-1", "SEV-2", "SEV-3")]
  [string]$Severity,

  [Parameter(Mandatory = $true)]
  [string]$Message,

  [string]$PolicyFile = "infra/ops/escalation-policy.local.json",
  [switch]$Escalated
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PolicyFile)) {
  throw "Escalation policy file not found: $PolicyFile. Copy from infra/ops/escalation-policy.example.json"
}

$policy = Get-Content -Raw -Path $PolicyFile | ConvertFrom-Json
$route = $policy.routes.$Severity

if ($null -eq $route) {
  throw "No route configured for severity $Severity"
}

$targets = @()
if ($Escalated) {
  $targets = @($route.escalateTo)
} else {
  $targets = @($route.notify)
}

if ($targets.Count -eq 0) {
  Write-Host "No targets configured for Severity=$Severity Escalated=$Escalated"
  exit 0
}

$timestamp = (Get-Date).ToString("o")
$payload = @{
  text = "[$Severity][$($policy.service)] $Message (time=$timestamp escalated=$Escalated)"
} | ConvertTo-Json -Compress

foreach ($target in $targets) {
  try {
    Invoke-RestMethod -Method Post -Uri $target -Body $payload -ContentType "application/json" | Out-Null
    Write-Host "Notification sent to $target"
  } catch {
    Write-Warning "Failed to send notification to $target: $($_.Exception.Message)"
  }
}
