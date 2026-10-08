# Applies every migration to an empty scratch database and checks the result equals schema.prisma.
# Usage (from backend/): .\scripts\db-baseline\verify-fresh.ps1
# Native-command stderr (npm warnings) must not abort the script; results are checked from output text.
$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\db-env.ps1"
$psql = Join-Path $env:PG_BIN 'psql.exe'
$db = 'ai_fresh_check'
& $psql -d postgres -tA -q -c "DROP DATABASE IF EXISTS $db;" 2>$null | Out-Null
& $psql -d postgres -tA -q -c "CREATE DATABASE $db;" 2>$null | Out-Null
$saved = $env:DATABASE_URL
$ok = $false
try {
  $env:DATABASE_URL = "postgresql://$($env:PGUSER):$([uri]::EscapeDataString($env:PGPASSWORD))@$($env:PGHOST):$($env:PGPORT)/${db}?schema=public"
  $deploy = (npx prisma migrate deploy 2>&1 | ForEach-Object { "$_" }) -join "`n"
  if ($deploy -notmatch 'successfully applied') { 'FRESH DEPLOY FAILED:'; $deploy; return }
  $diff = (npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script 2>$null) -join "`n"
  if ($diff -match 'This is an empty migration') { 'FRESH DEPLOY OK: all migrations applied, diff empty'; $ok = $true } else { 'FRESH DEPLOY DIFF NOT EMPTY:'; $diff }
} finally {
  if ($null -eq $saved) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $saved }
  & $psql -d postgres -tA -q -c "DROP DATABASE IF EXISTS $db;" 2>$null | Out-Null
}
if (-not $ok) { exit 1 }
