param(
  [string]$ApiBaseUrl = "http://localhost:3093",
  [int]$Max5xxErrors = 0,
  [switch]$RequireMetrics
)

$ErrorActionPreference = "Stop"

function Fail([string]$message) {
  Write-Error $message
  exit 1
}

try {
  $health = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/health" -TimeoutSec 10
} catch {
  Fail "Health endpoint unreachable at $ApiBaseUrl/health"
}

if ($health.status -ne "ok") {
  Fail "Health status is '$($health.status)' (expected 'ok')"
}

if ($health.checks.db -ne "ok") {
  Fail "Database check is '$($health.checks.db)'"
}

if ($RequireMetrics) {
  try {
    $metrics = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/metrics" -TimeoutSec 10
  } catch {
    Fail "Metrics endpoint unreachable at $ApiBaseUrl/metrics"
  }

  if ($null -ne $metrics.http_requests) {
    $error5xx = [int]$metrics.http_requests.error_5xx
    if ($error5xx -gt $Max5xxErrors) {
      Fail "error_5xx=$error5xx exceeds threshold Max5xxErrors=$Max5xxErrors"
    }
  }
}

Write-Host "Health monitor check passed for $ApiBaseUrl"
exit 0
