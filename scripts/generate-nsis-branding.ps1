param(
  [ValidateRange(2, 4)]
  [int]$Scale = 3
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$iconsDirectory = Join-Path $repositoryRoot 'src-tauri\icons'
$sourceIconPath = Join-Path $iconsDirectory 'icon-512.png'
$headerOutputPath = Join-Path $iconsDirectory 'nsis-header.bmp'
$sidebarOutputPath = Join-Path $iconsDirectory 'nsis-sidebar.bmp'

function New-RoundedRectanglePath {
  param(
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-BrandingCanvas {
  param(
    [int]$LogicalWidth,
    [int]$LogicalHeight,
    [int]$ScaleFactor
  )

  $bitmap = [System.Drawing.Bitmap]::new(
    $LogicalWidth * $ScaleFactor,
    $LogicalHeight * $ScaleFactor,
    [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
  )
  $bitmap.SetResolution(96, 96)
  return $bitmap
}

function Set-HighQualityRendering {
  param([System.Drawing.Graphics]$Graphics)

  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
}

function Write-HeaderBitmap {
  param(
    [System.Drawing.Image]$Icon,
    [int]$ScaleFactor,
    [string]$OutputPath
  )

  $bitmap = New-BrandingCanvas -LogicalWidth 150 -LogicalHeight 57 -ScaleFactor $ScaleFactor
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  Set-HighQualityRendering -Graphics $graphics

  $width = $bitmap.Width
  $height = $bitmap.Height
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(0, 0, $width, $height),
    [System.Drawing.Color]::FromArgb(48, 48, 78),
    [System.Drawing.Color]::FromArgb(35, 35, 58),
    0
  )
  $graphics.FillRectangle($background, 0, 0, $width, $height)

  $accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(36, 167, 139, 250))
  $graphics.FillEllipse($accent, 22 * $ScaleFactor, -66 * $ScaleFactor, 106 * $ScaleFactor, 132 * $ScaleFactor)
  $graphics.DrawImage($Icon, 54 * $ScaleFactor, 7 * $ScaleFactor, 42 * $ScaleFactor, 42 * $ScaleFactor)

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

  $accent.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Write-SidebarBitmap {
  param(
    [System.Drawing.Image]$Icon,
    [int]$ScaleFactor,
    [string]$OutputPath
  )

  $bitmap = New-BrandingCanvas -LogicalWidth 164 -LogicalHeight 314 -ScaleFactor $ScaleFactor
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  Set-HighQualityRendering -Graphics $graphics

  $width = $bitmap.Width
  $height = $bitmap.Height
  $background = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(0, 0, $width, $height),
    [System.Drawing.Color]::FromArgb(48, 48, 78),
    [System.Drawing.Color]::FromArgb(36, 36, 60),
    90
  )
  $graphics.FillRectangle($background, 0, 0, $width, $height)

  $shapeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(28, 199, 191, 255))
  $graphics.FillEllipse($shapeBrush, -92 * $ScaleFactor, -82 * $ScaleFactor, 190 * $ScaleFactor, 250 * $ScaleFactor)
  $graphics.FillEllipse($shapeBrush, 57 * $ScaleFactor, 104 * $ScaleFactor, 184 * $ScaleFactor, 286 * $ScaleFactor)

  $iconBackdrop = New-RoundedRectanglePath -X (30 * $ScaleFactor) -Y (105 * $ScaleFactor) -Width (104 * $ScaleFactor) -Height (104 * $ScaleFactor) -Radius (21 * $ScaleFactor)
  $iconBackdropBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24, 255, 255, 255))
  $graphics.FillPath($iconBackdropBrush, $iconBackdrop)
  $graphics.DrawImage($Icon, 42 * $ScaleFactor, 117 * $ScaleFactor, 80 * $ScaleFactor, 80 * $ScaleFactor)

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

  $iconBackdropBrush.Dispose()
  $iconBackdrop.Dispose()
  $shapeBrush.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

$sourceIcon = [System.Drawing.Image]::FromFile($sourceIconPath)
try {
  Write-HeaderBitmap -Icon $sourceIcon -ScaleFactor $Scale -OutputPath $headerOutputPath
  Write-SidebarBitmap -Icon $sourceIcon -ScaleFactor $Scale -OutputPath $sidebarOutputPath
} finally {
  $sourceIcon.Dispose()
}

Write-Host "Generated NSIS branding bitmaps at ${Scale}x density."
