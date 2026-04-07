param(
  [switch]$SkipFrontendBuild
)

$ErrorActionPreference = 'Stop'

$rootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$nsisOutputDir = Join-Path $rootDir 'src-tauri\target\release\bundle\nsis'
$frontendDistIndex = Join-Path $rootDir 'dist\index.html'

$variants = @(
  @{
    Key = 'zh-CN'
    Label = 'Chinese'
    ConfigPath = 'src-tauri/tauri.nsis.zh.conf.json'
  },
  @{
    Key = 'en-US'
    Label = 'English'
    ConfigPath = 'src-tauri/tauri.nsis.en.conf.json'
  }
)

function Invoke-PnpmCommand {
  param(
    [string[]]$Arguments,
    [string]$FailureMessage
  )

  $powershellExe = Join-Path $PSHOME 'powershell.exe'
  $escapedArguments = $Arguments | ForEach-Object {
    if ($_ -match '\s') {
      '"' + $_.Replace('"', '\"') + '"'
    } else {
      $_
    }
  }

  $commandLine = (@('pnpm.cmd') + $escapedArguments) -join ' '
  & $powershellExe -NoProfile -Command $commandLine
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (exit code $LASTEXITCODE)"
  }
}

function Invoke-InstallerBuild {
  param(
    [string]$ConfigPath,
    [string]$Label
  )

  Write-Host ""
  Write-Host "==> Building $Label installer"

  Invoke-PnpmCommand `
    -Arguments @('tauri', 'build', '--bundles', 'nsis', '--ci', '--config', $ConfigPath) `
    -FailureMessage "$Label installer build failed"
}

function Invoke-FrontendBuild {
  Write-Host "==> Type checking frontend"
  Invoke-PnpmCommand -Arguments @('exec', 'tsc', '--noEmit') -FailureMessage 'Type checking failed'

  Write-Host ""
  Write-Host "==> Building frontend assets"
  Invoke-PnpmCommand -Arguments @('exec', 'vite', 'build') -FailureMessage 'Frontend build failed'
}

function Get-LatestArtifact {
  param(
    [string]$Suffix
  )

  $artifact = Get-ChildItem -LiteralPath $nsisOutputDir -File |
    Where-Object {
      $_.Name.EndsWith($Suffix) -and $_.Name -notmatch '-[a-z]{2}-[A-Z]{2}(?:\.)'
    } |
    Sort-Object LastWriteTimeUtc -Descending |
    Select-Object -First 1

  if (-not $artifact) {
    throw "No NSIS artifact ending with '$Suffix' was found in $nsisOutputDir."
  }

  return $artifact.FullName
}

function Add-VariantSuffix {
  param(
    [string]$FilePath,
    [string]$VariantKey
  )

  $directory = Split-Path -Parent $FilePath
  $fileName = Split-Path -Leaf $FilePath

  if ($fileName.EndsWith('.exe.sig')) {
    $variantFileName = $fileName -replace '\.exe\.sig$', "-$VariantKey.exe.sig"
    return Join-Path $directory $variantFileName
  }

  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
  $extension = [System.IO.Path]::GetExtension($fileName)
  return Join-Path $directory "$baseName-$VariantKey$extension"
}

function Copy-VariantArtifact {
  param(
    [string]$SourcePath,
    [string]$VariantKey
  )

  $targetPath = Add-VariantSuffix -FilePath $SourcePath -VariantKey $VariantKey
  Copy-Item -LiteralPath $SourcePath -Destination $targetPath -Force
  return $targetPath
}

New-Item -ItemType Directory -Path $nsisOutputDir -Force | Out-Null

$createdArtifacts = New-Object System.Collections.Generic.List[string]

if (-not $SkipFrontendBuild) {
  try {
    Invoke-FrontendBuild
  } catch {
    if (Test-Path -LiteralPath $frontendDistIndex) {
      Write-Warning "Frontend build failed, but an existing dist bundle was found. Continuing with the current frontend artifacts. $($_.Exception.Message)"
    } else {
      throw
    }
  }
}

foreach ($variant in $variants) {
  Invoke-InstallerBuild -ConfigPath $variant.ConfigPath -Label $variant.Label

  $installerPath = Get-LatestArtifact -Suffix '-setup.exe'
  $createdArtifacts.Add((Copy-VariantArtifact -SourcePath $installerPath -VariantKey $variant.Key))
}

Write-Host ""
Write-Host "Created installer artifacts:"
foreach ($artifactPath in $createdArtifacts) {
  $relativePath = $artifactPath.Substring($rootDir.Length).TrimStart('\')
  Write-Host "- $relativePath"
}
