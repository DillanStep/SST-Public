param(
    [switch]$Force,
    [switch]$IncludeNodeModules
)

$ErrorActionPreference = 'Stop'

$trimChars = @(
    [char][System.IO.Path]::DirectorySeparatorChar,
    [char][System.IO.Path]::AltDirectorySeparatorChar
)
$RootDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..')).TrimEnd($trimChars)

function Assert-UnderRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if ([System.IO.Path]::IsPathRooted($Path)) {
        $fullPath = [System.IO.Path]::GetFullPath($Path)
    } else {
        $fullPath = [System.IO.Path]::GetFullPath((Join-Path $RootDir $Path))
    }

    $rootWithSlash = "$RootDir\"
    if ($fullPath.Equals($RootDir, [System.StringComparison]::OrdinalIgnoreCase) -or
        $fullPath.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $fullPath
    }

    throw "Refusing to operate outside repo root: $fullPath"
}

function Format-Bytes {
    param([int64]$Bytes)

    if ($Bytes -ge 1GB) {
        return ('{0:N2} GB' -f ($Bytes / 1GB))
    }
    if ($Bytes -ge 1MB) {
        return ('{0:N2} MB' -f ($Bytes / 1MB))
    }
    if ($Bytes -ge 1KB) {
        return ('{0:N2} KB' -f ($Bytes / 1KB))
    }
    return "$Bytes B"
}

function Get-ByteCount {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo]$Item
    )

    if ($Item -is [System.IO.FileInfo]) {
        return [int64]$Item.Length
    }

    $sum = Get-ChildItem -LiteralPath $Item.FullName -Force -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum

    if ($null -eq $sum.Sum) {
        return [int64]0
    }

    return [int64]$sum.Sum
}

function Remove-GeneratedItem {
    param(
        [Parameter(Mandatory = $true)]
        [System.IO.FileSystemInfo]$Item,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    $fullPath = Assert-UnderRoot $Item.FullName
    $bytes = Get-ByteCount $Item
    $kind = if ($Item.PSIsContainer) { 'directory' } else { 'file' }
    $verb = if ($Force) { 'Removing' } else { 'Would remove' }

    $script:MatchedCount += 1
    $script:MatchedBytes += $bytes

    Write-Host ("{0}: {1}" -f $verb, $fullPath)
    Write-Host ("  {0}; {1}; {2}" -f $Description, $kind, (Format-Bytes $bytes))

    if ($Force) {
        Remove-Item -LiteralPath $fullPath -Force -Recurse:$Item.PSIsContainer -ErrorAction Stop
        $script:RemovedCount += 1
    }
}

function Add-PathTarget {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativePath,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    $fullPath = Assert-UnderRoot $RelativePath
    $item = Get-Item -LiteralPath $fullPath -Force -ErrorAction SilentlyContinue
    if ($null -ne $item) {
        Remove-GeneratedItem -Item $item -Description $Description
    }
}

function Add-PatternTarget {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativePattern,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    $patternPath = Join-Path $RootDir $RelativePattern
    $items = Get-ChildItem -Path $patternPath -Force -File -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        [void](Assert-UnderRoot $item.FullName)
        Remove-GeneratedItem -Item $item -Description $Description
    }
}

function Add-DirectoryPatternTarget {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RelativePattern,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    $patternPath = Join-Path $RootDir $RelativePattern
    $items = Get-ChildItem -Path $patternPath -Force -Directory -ErrorAction SilentlyContinue
    foreach ($item in $items) {
        [void](Assert-UnderRoot $item.FullName)
        Remove-GeneratedItem -Item $item -Description $Description
    }
}

$pathTargets = @(
    @{ RelativePath = 'build'; Description = 'release and installer build output' },
    @{ RelativePath = 'logs'; Description = 'local SST logs' },
    @{ RelativePath = 'apps/api/data'; Description = 'generated API databases and cache' },
    @{ RelativePath = 'apps/api/profiles'; Description = 'generated API provider profiles' },
    @{ RelativePath = 'apps/web/dist'; Description = 'compiled dashboard output' },
    @{ RelativePath = 'tools/installer/bin'; Description = 'installer .NET build output' },
    @{ RelativePath = 'tools/installer/obj'; Description = 'installer .NET intermediate output' },
    @{ RelativePath = 'tools/manager/bin'; Description = 'manager .NET build output' },
    @{ RelativePath = 'tools/manager/obj'; Description = 'manager .NET intermediate output' }
)

if ($IncludeNodeModules) {
    $pathTargets += @(
        @{ RelativePath = 'apps/api/node_modules'; Description = 'API dependency install folder' },
        @{ RelativePath = 'apps/web/node_modules'; Description = 'dashboard dependency install folder' }
    )
}

$directoryPatternTargets = @(
    @{ RelativePattern = '.*-logs'; Description = 'local tool logs' }
)

$patternTargets = @(
    @{ RelativePattern = 'tools/installer/assets/*.zip'; Description = 'embedded installer payload archive' }
)

$script:MatchedCount = 0
$script:RemovedCount = 0
$script:MatchedBytes = [int64]0

Write-Host 'SST workspace cleanup'
Write-Host ("Repo: {0}" -f $RootDir)
if ($Force) {
    Write-Host 'Mode: delete generated files'
} else {
    Write-Host 'Mode: dry run only'
}

if (-not $IncludeNodeModules) {
    Write-Host 'Skipping node_modules folders. Add -IncludeNodeModules to include them.'
}

Write-Host ''

foreach ($target in $pathTargets) {
    Add-PathTarget -RelativePath $target.RelativePath -Description $target.Description
}

foreach ($target in $directoryPatternTargets) {
    Add-DirectoryPatternTarget -RelativePattern $target.RelativePattern -Description $target.Description
}

foreach ($target in $patternTargets) {
    Add-PatternTarget -RelativePattern $target.RelativePattern -Description $target.Description
}

Write-Host ''
if ($MatchedCount -eq 0) {
    Write-Host 'No cleanup targets found.'
    exit 0
}

Write-Host ("Targets: {0}" -f $MatchedCount)
Write-Host ("Size: {0}" -f (Format-Bytes $MatchedBytes))

if ($Force) {
    Write-Host ("Removed: {0}" -f $RemovedCount)
} else {
    Write-Host 'Dry run complete. Re-run with -Force after checking the list.'
}
