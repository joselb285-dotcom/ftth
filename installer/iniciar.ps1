# Lanzador FTTH GIS Editor: levanta PostgreSQL embebido + servidor y abre el navegador.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$pgbin = "$root\pgsql\bin"
$data  = "$root\data"
$cfg   = "$root\config.env"
$port  = 5433
$host.UI.RawUI.WindowTitle = 'FTTH GIS Editor - cierra esta ventana para detener el servidor'

try {
  if (-not (Test-Path "$data\PG_VERSION")) {
    Write-Host 'Inicializando base de datos (primera vez)...'
    & "$pgbin\initdb.exe" -U postgres -A trust -E UTF8 --locale=C -D $data | Out-Null
  }
  & "$pgbin\pg_ctl.exe" -D $data status *> $null
  if ($LASTEXITCODE -ne 0) {
    & "$pgbin\pg_ctl.exe" -D $data -w -o "-p $port -c listen_addresses=localhost" -l "$root\pg.log" start | Out-Null
  }
  $has = & "$pgbin\psql.exe" -U postgres -h localhost -p $port -tAc "SELECT 1 FROM pg_database WHERE datname='ftth'"
  if ($has -ne '1') { & "$pgbin\createdb.exe" -U postgres -h localhost -p $port ftth }

  Get-Content $cfg | ForEach-Object { if ($_ -match '^([^=]+)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] } }
  $env:DATABASE_URL = "postgres://postgres@localhost:$port/ftth"
  Set-Location "$root\app"
  & "$root\node.exe" server\migrate.js
  Start-Process "http://localhost:$($env:PORT)"
  Write-Host "Servidor activo en http://localhost:$($env:PORT) - no cierres esta ventana."
  & "$root\node.exe" server\index.js
} catch {
  Write-Host "ERROR: $_" -ForegroundColor Red
  Read-Host 'Enter para cerrar'
} finally {
  & "$pgbin\pg_ctl.exe" -D $data -m fast stop *> $null
}
