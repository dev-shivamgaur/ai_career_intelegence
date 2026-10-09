# Applies pending migrations to the dev database (migrate deploy only; never migrate dev / reset / db push),
# then regenerates the Prisma client. A running dev server locks the query engine DLL; Windows allows
# renaming a loaded DLL, so the locked file is moved aside and the server keeps using its loaded copy.
# Usage (from backend/): .\scripts\db-baseline\apply-dev.ps1
$ErrorActionPreference = 'Continue'
foreach ($k in 'DATABASE_URL', 'PORT', 'RABBITMQ_URL', 'ADMIN_PHONES', 'RAG_SYNC_ON_START') { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
$deploy = (npx prisma migrate deploy 2>&1 | ForEach-Object { "$_" }) -join "`n"
$deploy -split "`n" | Where-Object { $_ -match 'Datasource|Applying|successfully|No pending|Error|P\d{4}' }
if ($deploy -notmatch 'successfully applied|No pending migrations') { 'DEV DEPLOY FAILED'; exit 1 }
$engine = 'generated/prisma/query_engine-windows.dll.node'
if (Test-Path $engine) {
  try { [IO.File]::Open((Resolve-Path $engine), 'Open', 'ReadWrite', 'None').Close() }
  catch { Rename-Item $engine ("query_engine-windows.dll.node.locked-" + (Get-Date -Format yyyyMMddHHmmss)) }
}
$gen = (npx prisma generate 2>&1 | ForEach-Object { "$_" }) -join "`n"
if ($gen -match 'Generated Prisma Client') { 'PRISMA CLIENT GENERATED' } else { $gen; exit 1 }
