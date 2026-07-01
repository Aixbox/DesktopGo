$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$cargoHome = "D:\sdk\rust\cargo"
$rustupHome = "D:\sdk\rust\rustup"
$cargoBin = Join-Path $cargoHome "bin"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  $cargoExe = Join-Path $cargoBin "cargo.exe"
  if (Test-Path $cargoExe) {
    $env:PATH = "$cargoBin;$env:PATH"
  }
}

if (-not $env:CARGO_HOME -and (Test-Path $cargoHome)) {
  $env:CARGO_HOME = $cargoHome
}

if (-not $env:RUSTUP_HOME -and (Test-Path $rustupHome)) {
  $env:RUSTUP_HOME = $rustupHome
}

$localTauri = Join-Path $repoRoot "node_modules\.bin\tauri.cmd"
if (Test-Path $localTauri) {
  & $localTauri @args
  exit $LASTEXITCODE
}

$pnpm = Get-Command pnpm -ErrorAction Stop
& $pnpm.Source exec tauri @args
exit $LASTEXITCODE