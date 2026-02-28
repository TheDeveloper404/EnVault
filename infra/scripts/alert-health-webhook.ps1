param(
  [string]$ApiBaseUrl = "http://localhost:3093",
  [Parameter(Mandatory = $true)]
  [string]$WebhookUrl,
  [int]$Max5xxErrors = 0
)

$ErrorActionPreference = "Stop"

function Send-Alert([string]$text) {
  $payload = @{ text = "[EnVault Alert] $text" } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri $WebhookUrl -ContentType "application/json" -Body $payload | Out-Null
}

try {
  $health = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/health" -TimeoutSec 10

  if ($health.status -ne "ok" -or $health.checks.db -ne "ok") {
    Send-Alert "Health degraded at $ApiBaseUrl (status=$($health.status), db=$($health.checks.db))."
    exit 2
  }

  $metrics = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/metrics" -TimeoutSec 10
  if ($null -ne $metrics.http_requests) {
    $error5xx = [int]$metrics.http_requests.error_5xx
    if ($error5xx -gt $Max5xxErrors) {
      Send-Alert "5xx threshold exceeded at $ApiBaseUrl (error_5xx=$error5xx, threshold=$Max5xxErrors)."
      exit 3
    }
  }

  Write-Host "Alert webhook check passed for $ApiBaseUrl"
  exit 0
} catch {
  Send-Alert "Health check failed at $ApiBaseUrl. Error: $($_.Exception.Message)"
  exit 1
}
