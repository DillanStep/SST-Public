<#
.SYNOPSIS
    Resets local SST Dashboard state back to first-run setup.

.DESCRIPTION
    Removes generated API/web state that can stop SST from behaving like a new install:
    - API .env and local .env overrides
    - API auth/archive/position databases, including SQLite WAL/SHM files
    - API local fallback profiles folder
    - Web production build and local build cache
    - Optional node_modules folders

    The script also creates .sst-reset-client.flag. Start-SST.bat uses that flag
    to open a small browser reset page that clears SST localStorage/sessionStorage
    for the dashboard origin.

.PARAMETER Force
    Skip confirmation prompts.

.PARAMETER IncludeNodeModules
    Also remove node_modules folders. This makes the folder smaller, but you must reinstall.

.PARAMETER NoStopRunning
    Do not stop SST node/cmd processes before deleting files.

.PARAMETER NoBrowserResetFlag
    Do not create the browser reset flag for Start-SST.bat.
#>

param(
    [switch]$Force,
    [switch]$IncludeNodeModules,
    [switch]$NoStopRunning,
    [switch]$NoBrowserResetFlag
)

$ErrorActionPreference = 'Stop'

function Write-Header { param([string]$Text) Write-Host ""; Write-Host $Text -ForegroundColor Cyan }
function Write-Success { param([string]$Text) Write-Host "  [OK] $Text" -ForegroundColor Green }
function Write-Skip { param([string]$Text) Write-Host "  [--] $Text" -ForegroundColor DarkGray }
function Write-Warn { param([string]$Text) Write-Host "  [!!] $Text" -ForegroundColor Yellow }

$RootDir = [System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\', '/')
$ApiDir = Join-Path $RootDir "apps\api"
$WebDir = Join-Path $RootDir "apps\web"
$ResetClientFlag = Join-Path $RootDir ".sst-reset-client.flag"

function Test-LockedFileError {
    param([string]$Message)

    $text = ([string]$Message).ToLowerInvariant()
    return (
        $text.Contains("being used by another process") -or
        $text.Contains("cannot access the file") -or
        $text.Contains("access to the path") -or
        $text.Contains("access is denied")
    )
}

function Stop-WithRemoveFailure {
    param(
        [Parameter(Mandatory = $true)][string[]]$Paths,
        [Parameter(Mandatory = $true)][string]$Message,
        [switch]$Locked
    )

    Write-Host ""
    if ($Locked) {
        Write-Host "Reset could not finish because Windows still has these SST files open:" -ForegroundColor Yellow
    } else {
        Write-Host "Reset could not finish because a file could not be removed:" -ForegroundColor Yellow
    }

    foreach ($pathValue in $Paths) {
        Write-Host "  - $pathValue" -ForegroundColor White
    }

    Write-Host ""
    Write-Host "What this means:" -ForegroundColor Cyan
    if ($Locked) {
        Write-Host "  SST, Node.js, a terminal, or a SQLite/database viewer still has one of these files open."
    } else {
        Write-Host "  Windows refused the delete operation."
    }

    Write-Host ""
    Write-Host "Try this:" -ForegroundColor Cyan
    Write-Host "  1. Close any 'SST API', 'SST Web', Node.js, npm, or DayZ/SST terminal windows."
    Write-Host "  2. Close DB Browser/SQLite tools if you opened an SST .db file."
    Write-Host "  3. Run Reset-Factory.bat again."
    Write-Host "  4. If it still happens, restart Windows and run Reset-Factory.bat before starting SST."

    Write-Host ""
    Write-Host "Original Windows message:" -ForegroundColor DarkGray
    Write-Host "  $Message" -ForegroundColor DarkGray
    exit 2
}

function Remove-SstItem {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label,
        [switch]$Recurse
    )

    try {
        if ($Recurse) {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
        } else {
            Remove-Item -LiteralPath $Path -Force -ErrorAction Stop
        }
        return $true
    } catch {
        $message = $_.Exception.Message
        Stop-WithRemoveFailure -Paths @($Path) -Message $message -Locked:(Test-LockedFileError $message)
    }
}

function Resolve-UnderRoot {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $fullPath = [System.IO.Path]::GetFullPath($Path)
    $rootWithSlash = "$RootDir\"
    if (
        -not $fullPath.Equals($RootDir, [System.StringComparison]::OrdinalIgnoreCase) -and
        -not $fullPath.StartsWith($rootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)
    ) {
        throw "Refusing to remove $Label outside the SST folder: $fullPath"
    }

    return $fullPath
}

function Remove-FileIfExists {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $safePath = Resolve-UnderRoot -Path $Path -Label $Label
    if (Test-Path -LiteralPath $safePath -PathType Leaf) {
        Remove-SstItem -Path $safePath -Label $Label | Out-Null
        Write-Success "Deleted $Label"
    } else {
        Write-Skip "$Label not found"
    }
}

function Remove-DirectoryIfExists {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $safePath = Resolve-UnderRoot -Path $Path -Label $Label
    if (Test-Path -LiteralPath $safePath -PathType Container) {
        Remove-SstItem -Path $safePath -Label $Label -Recurse | Out-Null
        Write-Success "Deleted $Label"
    } else {
        Write-Skip "$Label not found"
    }
}

function Remove-MatchingFiles {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][string[]]$Patterns,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $safeDir = Resolve-UnderRoot -Path $Directory -Label $Label
    if (-not (Test-Path -LiteralPath $safeDir -PathType Container)) {
        Write-Skip "$Label folder not found"
        return
    }

    $removed = 0
    $failedPaths = @()
    $failedMessage = ""
    $failedLocked = $false
    Get-ChildItem -LiteralPath $safeDir -Recurse -File -ErrorAction SilentlyContinue | ForEach-Object {
        $file = $_
        foreach ($pattern in $Patterns) {
            if ($file.Name -like $pattern) {
                try {
                    Remove-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
                    $removed++
                } catch {
                    $failedPaths += $file.FullName
                    $failedMessage = $_.Exception.Message
                    if (Test-LockedFileError $failedMessage) {
                        $failedLocked = $true
                    }
                }
                break
            }
        }
    }

    if ($failedPaths.Count -gt 0) {
        Stop-WithRemoveFailure -Paths $failedPaths -Message $failedMessage -Locked:$failedLocked
    }

    if ($removed -gt 0) {
        Write-Success "Deleted $removed $Label file(s)"
    } else {
        Write-Skip "No $Label files found"
    }
}

function Stop-SstProcesses {
    $escapedRoot = [regex]::Escape($RootDir)
    $currentPid = $PID
    $processesByCommand = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.ProcessId -ne $currentPid -and
        $_.CommandLine -and
        (
            ($_.CommandLine -match $escapedRoot -and ($_.Name -ieq "node.exe" -or ($_.Name -ieq "cmd.exe" -and $_.CommandLine -match "run-api\.bat|npm(\.cmd)?\s+run\s+dev|vite"))) -or
            ($_.Name -ieq "node.exe" -and $_.CommandLine -match "src[\\/]+server\.js")
        )
    })

    $processesByPort = @()
    try {
        $ports = @(3001, 5173, 5174, 5175)
        $portProcessIds = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
            Where-Object { $ports -contains $_.LocalPort -and $_.OwningProcess -ne $currentPid } |
            Select-Object -ExpandProperty OwningProcess -Unique

        foreach ($processId in $portProcessIds) {
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
            if ($processInfo -and ($processInfo.Name -ieq "node.exe" -or $processInfo.Name -ieq "cmd.exe")) {
                $processesByPort += $processInfo
            }
        }
    } catch {
        Write-Skip "Could not inspect SST ports; continuing with command-line process check"
    }

    $processesToStop = @($processesByCommand) + @($processesByPort) |
        Where-Object { $_ } |
        Sort-Object -Property ProcessId -Unique

    $stopped = 0
    foreach ($process in $processesToStop) {
        try {
            Write-Host "  Stopping $($process.Name) pid $($process.ProcessId)" -ForegroundColor Gray
            Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
            $stopped++
        } catch {
            Write-Warn "Could not stop process $($process.ProcessId): $($_.Exception.Message)"
        }
    }

    if ($stopped -gt 0) {
        Write-Success "Stopped $stopped SST process(es)"
        Start-Sleep -Milliseconds 700
    } else {
        Write-Skip "No running SST processes found"
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Red
Write-Host " SST Dashboard - Factory Reset" -ForegroundColor Red
Write-Host "============================================================" -ForegroundColor Red
Write-Host ""
Write-Host "This will reset the local dashboard/API install back to first-run setup." -ForegroundColor Yellow
Write-Host ""
Write-Host "Will remove:"
Write-Host "  - apps/api/.env and .env.local"
Write-Host "  - apps/api/data SQLite databases and WAL/SHM files"
Write-Host "  - apps/api/profiles local fallback runtime data"
Write-Host "  - apps/web/dist and local build cache"
if ($IncludeNodeModules) {
    Write-Host "  - apps/api/node_modules and apps/web/node_modules" -ForegroundColor Yellow
}
if (-not $NoBrowserResetFlag) {
    Write-Host "  - browser SST local state on next Start-SST.bat launch"
}
Write-Host ""

if (-not $Force) {
    $confirm = Read-Host "Type RESET to continue"
    if ($confirm -ne "RESET") {
        Write-Host ""
        Write-Host "Reset cancelled." -ForegroundColor Gray
        exit 0
    }
}

Write-Header "[1/6] Stopping SST processes"
if ($NoStopRunning) {
    Write-Skip "Skipped process stop"
} else {
    Stop-SstProcesses
}

Write-Header "[2/6] Removing API runtime data"
$sqlitePatterns = @("*.db", "*.db-journal", "*.db-shm", "*.db-wal", "*.sqlite", "*.sqlite3")
Remove-MatchingFiles -Directory (Join-Path $ApiDir "data") -Patterns $sqlitePatterns -Label "API database"
Remove-DirectoryIfExists -Path (Join-Path $ApiDir "profiles") -Label "API local profiles folder"

Write-Header "[3/6] Removing API configuration"
Remove-FileIfExists -Path (Join-Path $ApiDir ".env") -Label "apps/api/.env"
Remove-FileIfExists -Path (Join-Path $ApiDir ".env.local") -Label "apps/api/.env.local"

Write-Header "[4/6] Removing web build/cache"
Remove-DirectoryIfExists -Path (Join-Path $WebDir "dist") -Label "apps/web/dist"
Remove-FileIfExists -Path (Join-Path $WebDir "tsconfig.tsbuildinfo") -Label "apps/web/tsconfig.tsbuildinfo"
Remove-DirectoryIfExists -Path (Join-Path $WebDir "node_modules\.vite") -Label "apps/web/node_modules/.vite cache"

Write-Header "[5/6] Node modules"
if ($IncludeNodeModules) {
    Remove-DirectoryIfExists -Path (Join-Path $ApiDir "node_modules") -Label "apps/api/node_modules"
    Remove-DirectoryIfExists -Path (Join-Path $WebDir "node_modules") -Label "apps/web/node_modules"
} else {
    Write-Skip "Skipped node_modules (use -IncludeNodeModules to remove)"
}

Write-Header "[6/6] Browser reset helper"
if ($NoBrowserResetFlag) {
    Write-Skip "Skipped browser reset flag"
} else {
    Set-Content -LiteralPath $ResetClientFlag -Value (Get-Date -Format o) -Encoding ASCII
    Write-Success "Created .sst-reset-client.flag"
    Write-Host "  Start-SST.bat will open the browser reset page once, then continue to setup." -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Factory reset complete" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Run Install-SST.bat or SST-Setup.bat."
Write-Host "  2. Run Start-SST.bat."
Write-Host "  3. The browser should open as a fresh setup."
Write-Host ""
