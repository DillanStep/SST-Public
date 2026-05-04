param(
    [Parameter(Mandatory = $true)]
    [string]$InputPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [string]$ConverterPath = "",
    [int]$MaxOutputSize = 8192,
    [int]$JpegQuality = 88,
    [int]$MinTileBytes = 512,
    [int]$CropEdgePixels = 0,
    [switch]$Transpose,
    [switch]$FlipX,
    [switch]$FlipY,
    [switch]$KeepTemp
)

$ErrorActionPreference = "Stop"

function Resolve-ConverterPath {
    param([string]$RequestedPath)

    if ($RequestedPath -and (Test-Path -LiteralPath $RequestedPath)) {
        return (Resolve-Path -LiteralPath $RequestedPath).Path
    }

    $candidates = @(@(
        (Join-Path ${env:ProgramFiles(x86)} "Steam\steamapps\common\DayZ Tools\Bin\ImageToPAA\ImageToPAA.exe"),
        "D:\SteamLibrary\steamapps\common\DayZ Tools\Bin\ImageToPAA\ImageToPAA.exe",
        "C:\Program Files (x86)\Steam\steamapps\common\DayZ Tools\Bin\ImageToPAA\ImageToPAA.exe"
    ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) })

    if ($candidates.Count -gt 0) {
        return (Resolve-Path -LiteralPath $candidates[0]).Path
    }

    throw "Could not find ImageToPAA.exe. Install DayZ Tools, or pass -ConverterPath."
}

function Save-Bitmap {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [string]$Path,
        [int]$Quality
    )

    $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    if ($extension -eq ".png") {
        $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
        return
    }

    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
        Where-Object { $_.MimeType -eq "image/jpeg" } |
        Select-Object -First 1

    if (-not $encoder) {
        throw "Could not find a JPEG encoder."
    }

    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters 1
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), ([long]$Quality)
    try {
        $Bitmap.Save($Path, $encoder, $encoderParams)
    } finally {
        $encoderParams.Dispose()
    }
}

$sourceRoot = (Resolve-Path -LiteralPath $InputPath).Path
$converter = Resolve-ConverterPath $ConverterPath
$outputRoot = Split-Path -Parent $OutputPath
if ($outputRoot) {
    New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
}

$tiles = @(Get-ChildItem -LiteralPath $sourceRoot -Filter "S_*_*_lco.paa" | ForEach-Object {
    if ($_.Name -match "^S_(\d+)_(\d+)_lco\.paa$") {
        [pscustomobject]@{
            File = $_
            X = [int]$Matches[1]
            Y = [int]$Matches[2]
        }
    }
})

if (-not $tiles -or $tiles.Count -eq 0) {
    throw "No tiles matching S_000_000_lco.paa were found in $sourceRoot."
}

Add-Type -AssemblyName System.Drawing

$tempDir = Join-Path $env:TEMP ("sst-paa-stitch-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tempDir | Out-Null

$sampleTile = @($tiles | Where-Object { $_.File.Length -ge $MinTileBytes } | Select-Object -First 1)[0]
if (-not $sampleTile) {
    $sampleTile = $tiles[0]
}

$samplePath = Join-Path $tempDir ($sampleTile.File.BaseName + "-sample.png")
& $converter $sampleTile.File.FullName $samplePath | Out-Null
$sampleImage = [System.Drawing.Image]::FromFile($samplePath)
try {
    $tileSourceWidth = $sampleImage.Width
    $tileSourceHeight = $sampleImage.Height
} finally {
    $sampleImage.Dispose()
}

$gridWidth = (($tiles | Measure-Object -Property X -Maximum).Maximum + 1)
$gridHeight = (($tiles | Measure-Object -Property Y -Maximum).Maximum + 1)
if ($Transpose) {
    $gridWidth, $gridHeight = $gridHeight, $gridWidth
}

$nativeWidth = $gridWidth * $tileSourceWidth
$nativeHeight = $gridHeight * $tileSourceHeight
$scale = [Math]::Min(1, [Math]::Min($MaxOutputSize / $nativeWidth, $MaxOutputSize / $nativeHeight))
$tileOutWidth = [Math]::Max(1, [int][Math]::Floor($tileSourceWidth * $scale))
$tileOutHeight = [Math]::Max(1, [int][Math]::Floor($tileSourceHeight * $scale))
$outputWidth = $gridWidth * $tileOutWidth
$outputHeight = $gridHeight * $tileOutHeight

$bitmap = New-Object System.Drawing.Bitmap $outputWidth, $outputHeight, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighSpeed
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$graphics.Clear([System.Drawing.Color]::White)

# The converted layer PNGs keep useful RGB values even though the alpha channel is 0.
$colorMatrix = New-Object System.Drawing.Imaging.ColorMatrix
$colorMatrix.Matrix33 = 0
$colorMatrix.Matrix43 = 1
$imageAttrs = New-Object System.Drawing.Imaging.ImageAttributes
$imageAttrs.SetColorMatrix($colorMatrix)

Write-Host "Stitching $($tiles.Count) tiles from $sourceRoot"
Write-Host "Grid: $gridWidth x $gridHeight"
Write-Host "Source tile: $tileSourceWidth x $tileSourceHeight"
Write-Host "Output: $outputWidth x $outputHeight"

try {
    $index = 0
    $skipped = 0
    foreach ($tile in $tiles) {
        $index += 1
        if ($tile.File.Length -lt $MinTileBytes) {
            $skipped += 1
            continue
        }

        $pngPath = Join-Path $tempDir ($tile.File.BaseName + ".png")
        & $converter $tile.File.FullName $pngPath | Out-Null

        $image = [System.Drawing.Image]::FromFile($pngPath)
        try {
            $drawX = $tile.X
            $drawY = $tile.Y
            if ($Transpose) {
                $drawX, $drawY = $drawY, $drawX
            }
            if ($FlipX) {
                $drawX = $gridWidth - 1 - $drawX
            }
            if ($FlipY) {
                $drawY = $gridHeight - 1 - $drawY
            }

            $dest = New-Object System.Drawing.Rectangle ($drawX * $tileOutWidth), ($drawY * $tileOutHeight), $tileOutWidth, $tileOutHeight
            $cropX = [Math]::Min($CropEdgePixels, [Math]::Floor(($image.Width - 1) / 2))
            $cropY = [Math]::Min($CropEdgePixels, [Math]::Floor(($image.Height - 1) / 2))
            $sourceWidth = $image.Width - ($cropX * 2)
            $sourceHeight = $image.Height - ($cropY * 2)
            $graphics.DrawImage($image, $dest, $cropX, $cropY, $sourceWidth, $sourceHeight, [System.Drawing.GraphicsUnit]::Pixel, $imageAttrs)
        } finally {
            $image.Dispose()
        }

        if (($index % 64) -eq 0) {
            Write-Host "  $index / $($tiles.Count)"
        }
    }

    Save-Bitmap -Bitmap $bitmap -Path $OutputPath -Quality $JpegQuality
    if ($skipped -gt 0) {
        Write-Host "Skipped $skipped placeholder tiles smaller than $MinTileBytes bytes"
    }
    Write-Host "Saved $OutputPath"
} finally {
    $imageAttrs.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()

    if (-not $KeepTemp) {
        Remove-Item -LiteralPath $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "Kept temporary PNGs at $tempDir"
    }
}
