param(
  [string]$BaseRef,
  [switch]$All
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($All -and $BaseRef) {
  throw "Use either -All or -BaseRef, not both."
}

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$manifestPath = Join-Path $repoRoot "src-tauri\Cargo.toml"
$budgetScript = Join-Path $repoRoot ".codex\skills\maintain-modular-code\scripts\check-changed-files.mjs"

function Invoke-QualityStep {
  param(
    [string]$Name,
    [string]$Command,
    [string[]]$Arguments
  )

  Write-Host "==> $Name"
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE."
  }
}

Push-Location $repoRoot
try {
  Invoke-QualityStep "cargo fmt" "cargo" @(
    "fmt",
    "--manifest-path", $manifestPath,
    "--", "--check"
  )
  Invoke-QualityStep "cargo clippy" "cargo" @(
    "clippy",
    "--manifest-path", $manifestPath,
    "--all-targets",
    "--all-features",
    "--", "-D", "warnings"
  )
  Invoke-QualityStep "cargo check" "cargo" @(
    "check",
    "--manifest-path", $manifestPath
  )
  Invoke-QualityStep "cargo test" "cargo" @(
    "test",
    "--manifest-path", $manifestPath
  )

  $budgetArguments = @($budgetScript)
  if ($All) {
    $budgetArguments += "--all"
  } elseif ($BaseRef) {
    $budgetArguments += @("--base", $BaseRef)
  }
  Invoke-QualityStep "Rust file budgets" "node" $budgetArguments
} finally {
  Pop-Location
}
