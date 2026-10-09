# Runs a market integration script against a throwaway database (ai_market_it), then drops it.
# Usage (from backend/): .\scripts\market\run-integration.ps1 -Script scripts/market/m3-integration.ts
param([Parameter(Mandatory = $true)][string]$Script)
$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\..\db-baseline\db-env.ps1"
$psql = Join-Path $env:PG_BIN 'psql.exe'
$db = 'ai_market_it'
& $psql -d postgres -tA -q -c "DROP DATABASE IF EXISTS $db;" 2>$null | Out-Null
& $psql -d postgres -tA -q -c "CREATE DATABASE $db;" 2>$null | Out-Null
$saved = $env:DATABASE_URL
try {
  $env:DATABASE_URL = "postgresql://$($env:PGUSER):$([uri]::EscapeDataString($env:PGPASSWORD))@$($env:PGHOST):$($env:PGPORT)/${db}?schema=public"
  $deploy = (npx prisma migrate deploy 2>&1 | ForEach-Object { "$_" }) -join "`n"
  if ($deploy -notmatch 'successfully applied') { 'SCRATCH DEPLOY FAILED:'; $deploy; return }
  npx ts-node --transpile-only $Script 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ -notmatch 'npm warn' }
} finally {
  if ($null -eq $saved) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $saved }
  & $psql -d postgres -tA -q -c "DROP DATABASE IF EXISTS $db;" 2>$null | Out-Null
}
