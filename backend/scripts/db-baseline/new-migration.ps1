# Writes prisma/migrations/<name>/migration.sql from the diff between existing migrations and schema.prisma.
# Uses a throwaway shadow database; never touches the dev database.
# Usage (from backend/): .\scripts\db-baseline\new-migration.ps1 -Name 20261009130000_m2_sources
param([Parameter(Mandatory = $true)][string]$Name)
# Native-command stderr (npm warnings) must not abort the script; exit codes are checked explicitly.
$ErrorActionPreference = 'Continue'
. "$PSScriptRoot\db-env.ps1"
$psql = Join-Path $env:PG_BIN 'psql.exe'
$shadow = 'ai_shadow_gen'
& $psql -d postgres -tA -c "DROP DATABASE IF EXISTS $shadow;" | Out-Null
& $psql -d postgres -tA -c "CREATE DATABASE $shadow;" | Out-Null
$url = "postgresql://$($env:PGUSER):$([uri]::EscapeDataString($env:PGPASSWORD))@$($env:PGHOST):$($env:PGPORT)/${shadow}?schema=public"
$tmp = Join-Path $env:TEMP "$Name.sql"
try {
  $sql = npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url $url --script 2>$null
  if ($LASTEXITCODE -ne 0) { throw "prisma migrate diff failed ($LASTEXITCODE)" }
  # Postgres rejects a UTF-8 BOM, which PowerShell 5 Set-Content would add.
  [IO.File]::WriteAllText($tmp, (($sql -join "`n") + "`n"), (New-Object Text.UTF8Encoding($false)))
} finally {
  & $psql -d postgres -tA -c "DROP DATABASE IF EXISTS $shadow;" | Out-Null
}
$dir = Join-Path 'prisma/migrations' $Name
# Create the folder only after the diff: an empty migration folder makes --from-migrations fail.
New-Item -ItemType Directory -Force $dir | Out-Null
Move-Item -Force $tmp (Join-Path $dir 'migration.sql')
Get-Content (Join-Path $dir 'migration.sql')
