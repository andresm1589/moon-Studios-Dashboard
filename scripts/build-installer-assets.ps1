[CmdletBinding()]
param(
    [ValidateRange(2, 4)]
    [int]$Scale = 3,
    [switch]$OrbitalOnly,
    [string]$FfmpegPath = 'C:/ffmpeg/bin/ffmpeg.exe'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$assetRoot = Join-Path $repoRoot 'src-tauri/installer/assets'
$logoPath = Join-Path $repoRoot 'public/brand/moon-completo-blanco.png'
New-Item -ItemType Directory -Force -Path $assetRoot | Out-Null

# Keep the supplied Moon Studios logo intact. All geometry and typography are
# rendered at 3x by default, then downsampled into a true 24-bit NSIS bitmap.
$width = 230
$height = 500
if (-not $OrbitalOnly) {
$canvas = [System.Drawing.Bitmap]::new($width * $Scale, $height * $Scale, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($canvas)
$logo = [System.Drawing.Image]::FromFile($logoPath)
$owned = [System.Collections.Generic.List[System.IDisposable]]::new()

function Color([string]$Hex) {
    return [System.Drawing.ColorTranslator]::FromHtml($Hex)
}

function Brush([string]$Hex) {
    $value = [System.Drawing.SolidBrush]::new((Color $Hex))
    $owned.Add($value)
    return $value
}

function Pen([string]$Hex, [single]$Thickness = 1) {
    $value = [System.Drawing.Pen]::new((Color $Hex), $Thickness)
    $owned.Add($value)
    return $value
}

function Font([single]$Size, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular) {
    $value = [System.Drawing.Font]::new('Segoe UI', $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    $owned.Add($value)
    return $value
}

function Draw-Text([string]$Text, [single]$X, [single]$Y, [single]$Size, [string]$Hex, [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular) {
    $graphics.DrawString($Text, (Font $Size $Style), (Brush $Hex), [System.Drawing.PointF]::new($X, $Y), [System.Drawing.StringFormat]::GenericTypographic)
}

try {
    $graphics.Clear((Color '#111111'))
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.ScaleTransform($Scale, $Scale)

    $logoWidth = [single]174
    $logoHeight = [single]($logoWidth * $logo.Height / $logo.Width)
    $graphics.DrawImage($logo, [System.Drawing.RectangleF]::new(28, 34, $logoWidth, $logoHeight))

    $graphics.DrawLine((Pen '#343434' 0.75), 28, 109, 202, 109)
    Draw-Text 'TU EQUIPO.' 28 142 14.5 '#F5F5F5' ([System.Drawing.FontStyle]::Bold)
    Draw-Text 'EN UN MISMO LUGAR.' 28 163 14.5 '#F5F5F5' ([System.Drawing.FontStyle]::Bold)
    Draw-Text 'Proyectos, personas y herramientas' 28 199 9.4 '#969696'
    Draw-Text 'conectados contigo.' 28 214 9.4 '#969696'

    # Native animation follows the 65 px circle around (115,365). These rings
    # deliberately contain no baked-in orbiting dot or text in that path.
    $graphics.DrawEllipse((Pen '#242424' 0.65), 23, 273, 184, 184)
    $graphics.DrawEllipse((Pen '#484848' 0.8), 50, 300, 130, 130)
    $graphics.DrawEllipse((Pen '#1E1E1E' 0.65), 72, 322, 86, 86)

    $orbitalState = $graphics.Save()
    $graphics.TranslateTransform(115, 365)
    $graphics.RotateTransform(-28)
    $graphics.DrawEllipse((Pen '#333333' 0.8), -99, -29, 198, 58)
    $graphics.Restore($orbitalState)

    $sphereRect = [System.Drawing.RectangleF]::new(95, 345, 40, 40)
    $sphere = [System.Drawing.Drawing2D.LinearGradientBrush]::new($sphereRect, (Color '#A3A3A3'), (Color '#1C1C1C'), [single]43)
    $owned.Add($sphere)
    $graphics.FillEllipse($sphere, $sphereRect)
    $graphics.DrawEllipse((Pen '#656565' 0.45), $sphereRect)

    # Sparse alignment marks provide depth without competing with progress.
    $graphics.DrawLine((Pen '#4B4B4B' 0.7), 112, 267, 118, 267)
    $graphics.DrawLine((Pen '#4B4B4B' 0.7), 115, 264, 115, 270)
    $graphics.DrawLine((Pen '#303030' 0.7), 17, 362, 17, 368)
    $graphics.DrawLine((Pen '#303030' 0.7), 14, 365, 20, 365)

    $graphics.DrawLine((Pen '#343434' 0.65), 28, 469, 202, 469)
    Draw-Text 'MOON STUDIOS / WINDOWS' 28 480 8 '#8B8B8B'

    $canvas.Save((Join-Path $assetRoot 'sidebar-preview-3x.png'), [System.Drawing.Imaging.ImageFormat]::Png)

    $final = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $finalGraphics = [System.Drawing.Graphics]::FromImage($final)
    try {
        $finalGraphics.Clear((Color '#111111'))
        $finalGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $finalGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $finalGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $finalGraphics.DrawImage($canvas, 0, 0, $width, $height)
        $final.Save((Join-Path $assetRoot 'sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
        $final.Save((Join-Path $assetRoot 'sidebar-preview.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $finalGraphics.Dispose()
        $final.Dispose()
    }
}
finally {
    foreach ($resource in $owned) { $resource.Dispose() }
    $logo.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
}

Write-Output ('Sidebar: {0} ({1} x {2}, RGB 24 bits)' -f (Join-Path $assetRoot 'sidebar.bmp'), $width, $height)
Write-Output ('Preview: {0}' -f (Join-Path $assetRoot 'sidebar-preview.png'))
}

# SysAnimate32 plays this silent, uncompressed DIB AVI on its own native worker.
# No script callback or UI timer is required while the install thread is busy.
if (-not (Test-Path -LiteralPath $FfmpegPath)) {
    $ffmpegCommand = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($null -eq $ffmpegCommand) {
        throw 'Se requiere ffmpeg para generar orbital.avi. Indica su ruta con -FfmpegPath.'
    }
    $FfmpegPath = $ffmpegCommand.Source
}

# FFmpeg emits raw RGB AVI with a negative BITMAPINFOHEADER height. The vflip
# above physically stores bottom-up rows; set a positive DIB height as required
# by the classic Windows animation control, preserving chunk lengths and idx1.
function Find-AviStreamFormat([byte[]]$Bytes, [int]$Start, [int]$End) {
    for ($chunkOffset = $Start; $chunkOffset + 8 -le $End;) {
        $chunkId = [System.Text.Encoding]::ASCII.GetString($Bytes, $chunkOffset, 4)
        $chunkSize = [System.BitConverter]::ToUInt32($Bytes, $chunkOffset + 4)
        $chunkEnd = $chunkOffset + 8 + $chunkSize
        if ($chunkEnd -gt $End) { throw 'AVI contiene un chunk fuera de su contenedor RIFF.' }
        if ($chunkId -eq 'strf') { return ($chunkOffset + 8) }
        if ($chunkId -eq 'LIST') {
            $nested = Find-AviStreamFormat $Bytes ($chunkOffset + 12) $chunkEnd
            if ($nested -ge 0) { return $nested }
        }
        $chunkOffset = $chunkEnd + ($chunkSize % 2)
    }
    return -1
}

if ($null -eq ('MoonInstallerBitmapNative' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MoonInstallerBitmapNative {
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr LoadImageW(IntPtr instance, string name, uint type, int width, int height, uint flags);
    [DllImport("gdi32.dll")]
    public static extern bool DeleteObject(IntPtr handle);
}
'@
}

$qaOrbitalRoot = Join-Path $repoRoot '.moon-qa/installer-v74/orbital-frames'
$sidebarPath = Join-Path $assetRoot 'sidebar.bmp'
$sidebarHashBefore = (Get-FileHash -Algorithm SHA256 -LiteralPath $sidebarPath).Hash
$frameCount = 48
$frameRate = 12
$manifest = [System.Collections.Generic.List[object]]::new()

foreach ($dpi in @(96, 120, 144, 168, 192)) {
    $dpiScale = $dpi / 96.0
    $side = [int][Math]::Floor(230 * $dpiScale)
    $sidebarHeight = [int][Math]::Floor(500 * $dpiScale)
    $cropY = [int][Math]::Floor(250 * $dpiScale)
    $frameRoot = if ($dpi -eq 96) { $qaOrbitalRoot } else { Join-Path $qaOrbitalRoot "dpi-$dpi" }
    New-Item -ItemType Directory -Force -Path $frameRoot | Out-Null

    # Use the exact API and dimensions used by the installer sidebar. This avoids
    # seams from a different resampling algorithm at Windows' standard DPI scales.
    $nativeBitmap = [MoonInstallerBitmapNative]::LoadImageW([IntPtr]::Zero, $sidebarPath, 0, $side, $sidebarHeight, 0x10)
    if ($nativeBitmap -eq [IntPtr]::Zero) { throw "LoadImageW no pudo escalar sidebar.bmp a $dpi DPI." }
    $loadedSidebar = [System.Drawing.Bitmap]::FromHbitmap($nativeBitmap)
    try {
        $sidebar = $loadedSidebar.Clone([System.Drawing.Rectangle]::new(0, 0, $side, $sidebarHeight), [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    }
    finally {
        $loadedSidebar.Dispose()
        [void][MoonInstallerBitmapNative]::DeleteObject($nativeBitmap)
    }
    $orbitalBase = $sidebar.Clone([System.Drawing.Rectangle]::new(0, $cropY, $side, $side), [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $center = 115 * $dpiScale
    $orbitRadius = 65 * $dpiScale
    $dotRadius = 3.5 * $dpiScale
    try {
        $sidebar.Save((Join-Path $frameRoot 'scaled-sidebar.bmp'), [System.Drawing.Imaging.ImageFormat]::Bmp)
        $orbitalBase.Save((Join-Path $frameRoot 'base-crop.png'), [System.Drawing.Imaging.ImageFormat]::Png)
        for ($frameIndex = 0; $frameIndex -lt $frameCount; $frameIndex++) {
            $angle = 2 * [Math]::PI * $frameIndex / $frameCount
            $dotX = [single]($center + $orbitRadius * [Math]::Cos($angle))
            $dotY = [single]($center + $orbitRadius * [Math]::Sin($angle))
            $frame = $orbitalBase.Clone([System.Drawing.Rectangle]::new(0, 0, $side, $side), [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
            $highlight = [System.Drawing.Bitmap]::new($side * $Scale, $side * $Scale, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $highlightGraphics = [System.Drawing.Graphics]::FromImage($highlight)
            $frameGraphics = [System.Drawing.Graphics]::FromImage($frame)
            try {
                $highlightGraphics.Clear([System.Drawing.Color]::Transparent)
                $highlightGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
                $highlightGraphics.ScaleTransform($Scale, $Scale)
                $highlightGraphics.FillEllipse([System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new($dotX - $dotRadius, $dotY - $dotRadius, $dotRadius * 2, $dotRadius * 2))
                $frameGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $frameGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
                $frameGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
                $frameGraphics.DrawImage($highlight, 0, 0, $side, $side)
                $frame.Save((Join-Path $frameRoot ('frame-{0:D2}.png' -f $frameIndex)), [System.Drawing.Imaging.ImageFormat]::Png)
            }
            finally {
                $frameGraphics.Dispose()
                $highlightGraphics.Dispose()
                $highlight.Dispose()
                $frame.Dispose()
            }
        }
    }
    finally {
        $orbitalBase.Dispose()
        $sidebar.Dispose()
    }

    $aviName = if ($dpi -eq 96) { 'orbital.avi' } else { "orbital-$dpi.avi" }
    $aviPath = Join-Path $assetRoot $aviName
    $ffmpegArgs = @(
        '-hide_banner', '-loglevel', 'error', '-y',
        '-framerate', "$frameRate", '-start_number', '0',
        '-i', (Join-Path $frameRoot 'frame-%02d.png'),
        '-frames:v', "$frameCount", '-an', '-c:v', 'rawvideo',
        '-vf', 'vflip', '-pix_fmt', 'bgr24', '-vtag', 'DIB ',
        '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:v', '+bitexact',
        '-f', 'avi', $aviPath
    )
    & $FfmpegPath @ffmpegArgs
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg no pudo generar $aviPath." }
    $stride = [int]([Math]::Ceiling($side * 3 / 4.0) * 4)
    $aviBytes = [System.IO.File]::ReadAllBytes($aviPath)
    $streamFormatOffset = Find-AviStreamFormat $aviBytes 12 $aviBytes.Length
    if ($streamFormatOffset -lt 0) { throw 'AVI no contiene BITMAPINFOHEADER.' }
    if ([System.BitConverter]::ToUInt16($aviBytes, $streamFormatOffset + 14) -ne 24 -or
        [System.BitConverter]::ToUInt32($aviBytes, $streamFormatOffset + 16) -ne 0) {
        throw 'AVI debe usar DIB BI_RGB de 24 bits sin compresión.'
    }
    [System.BitConverter]::GetBytes([int]$side).CopyTo($aviBytes, $streamFormatOffset + 8)
    [System.BitConverter]::GetBytes([uint32]($stride * $side)).CopyTo($aviBytes, $streamFormatOffset + 20)
    [System.IO.File]::WriteAllBytes($aviPath, $aviBytes)
    $receipt = [ordered]@{
        generator = 'scripts/build-installer-assets.ps1'
        generatorSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath).Hash.ToLowerInvariant()
        source = 'src-tauri/installer/assets/sidebar.bmp'
        sourceSha256 = $sidebarHashBefore.ToLowerInvariant()
        dpi = $dpi
        resampler = 'user32.LoadImageW (same API and dimensions as installer)'
        scaledSidebar = @{ width = $side; height = $sidebarHeight }
        crop = @{ x = 0; y = $cropY; width = $side; height = $side }
        dot = @{ centerX = $center; centerY = $center; orbitRadius = $orbitRadius; radius = $dotRadius; color = '#FFFFFF' }
        frames = $frameCount
        frameRate = $frameRate
        durationSeconds = $frameCount / $frameRate
        video = 'DIB / BI_RGB / bottom-up bgr24, no audio'
        output = "src-tauri/installer/assets/$aviName"
        outputSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $aviPath).Hash.ToLowerInvariant()
        outputBytes = (Get-Item -LiteralPath $aviPath).Length
    }
    $manifest.Add($receipt)
    $receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $frameRoot 'generation.json') -Encoding utf8
    Write-Output ('Orbital AVI: {0} ({1} DPI, {2} x {2}, {3} frames, {4} fps)' -f $aviPath, $dpi, $side, $frameCount, $frameRate)
}
$sidebarHashAfter = (Get-FileHash -Algorithm SHA256 -LiteralPath $sidebarPath).Hash
if ($sidebarHashBefore -ne $sidebarHashAfter) { throw 'El bitmap estático cambió durante la generación orbital.' }
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $qaOrbitalRoot 'manifest.json') -Encoding utf8
