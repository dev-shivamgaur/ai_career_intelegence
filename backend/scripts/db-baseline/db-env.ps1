# Dot-source from the repo root: . .\backend\scripts\db-baseline\db-env.ps1
# Reads backend/.env DATABASE_URL and exports PG* variables for the PostgreSQL client tools.
$line = Get-Content (Join-Path $PSScriptRoot '..\..\.env') | Where-Object { $_ -match '^DATABASE_URL=' }
$url = ($line -replace '^DATABASE_URL=', '').Trim('"')
if ($url -notmatch 'postgresql://([^:]+):([^@]+)@([^:/]+):(\d+)/([^?]+)') { throw 'DATABASE_URL not parseable' }
$env:PGUSER = $matches[1]
$env:PGPASSWORD = [uri]::UnescapeDataString($matches[2])
$env:PGHOST = $matches[3]
$env:PGPORT = $matches[4]
$env:PGDEV_DB = $matches[5]
if (-not $env:PG_BIN) { $env:PG_BIN = 'C:\Program Files\PostgreSQL\18\bin' }
