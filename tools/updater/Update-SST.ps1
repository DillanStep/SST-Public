param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [Parameter(Mandatory = $true)]
    [string]$ArchiveUrl,

    [Parameter(Mandatory = $true)]
    [string]$TargetTag,

    [Parameter(Mandatory = $true)]
    [string]$StatePath,

    [Parameter(Mandatory = $true)]
    [string]$LogPath
)

$ErrorActionPreference = "Stop"

function Write-UpdateState {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Status,

        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $stateDir = Split-Path -Parent $StatePath
    if (-not (Test-Path -LiteralPath $stateDir)) {
        New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
    }

    $state = [ordered]@{
        status = $Status
        message = $Message
        targetTag = $TargetTag
        logPath = $LogPath
        updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    }

    $json = $state | ConvertTo-Json -Depth 4
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($StatePath, $json, $utf8NoBom)
}

function Write-UpdateLog {
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyString()]
        [string]$Message
    )

    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Write-Host $line
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Script
    )

    Write-UpdateState -Status "running" -Message $Message
    Write-UpdateLog $Message
    & $Script
}

function Get-NpmCommand {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($npm) {
        return $npm.Source
    }

    $npm = Get-Command npm -ErrorAction Stop
    return $npm.Source
}

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [string[]]$Arguments = @(),

        [int]$MaxSuccessfulExitCode = 0
    )

    $display = $FilePath
    if ($Arguments.Count -gt 0) {
        $display = "$display $($Arguments -join ' ')"
    }
    Write-UpdateLog "> $display"

    & $FilePath @Arguments 2>&1 | ForEach-Object {
        Write-UpdateLog ([string]$_)
    }

    $exitCode = $LASTEXITCODE
    if ($exitCode -gt $MaxSuccessfulExitCode) {
        throw "$FilePath failed with exit code $exitCode."
    }

    return $exitCode
}

$logDir = Split-Path -Parent $LogPath
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

try {
    $RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupRoot = Join-Path $RepoRoot "backups\update-$timestamp"
    $tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) "sst-update-$timestamp"
    $zipPath = Join-Path $tempRoot "release.zip"
    $extractPath = Join-Path $tempRoot "extract"

    Invoke-Step "Preparing update workspace." {
        New-Item -ItemType Directory -Force -Path $backupRoot, $tempRoot, $extractPath | Out-Null
    }

    Invoke-Step "Backing up local configuration and data." {
        $backupItems = @(
            "apps\api\.env",
            "apps\api\data",
            "apps\api\profiles",
            "dayz\server-mod\@SST",
            "dayz\mod-source\SST",
            "@SST",
            "SST"
        )

        foreach ($item in $backupItems) {
            $source = Join-Path $RepoRoot $item
            if (Test-Path -LiteralPath $source) {
                $destination = Join-Path $backupRoot $item
                $destinationParent = Split-Path -Parent $destination
                New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
                Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
            }
        }
    }

    Invoke-Step "Downloading $TargetTag." {
        if (Test-Path -LiteralPath $ArchiveUrl) {
            Copy-Item -LiteralPath $ArchiveUrl -Destination $zipPath -Force
        } else {
            Invoke-WebRequest -Uri $ArchiveUrl -OutFile $zipPath -UseBasicParsing
        }
    }

    Invoke-Step "Extracting update package." {
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath -Force
    }

    $sourceRoot = Get-ChildItem -LiteralPath $extractPath -Directory | Select-Object -First 1
    if (-not $sourceRoot) {
        throw "The update archive did not contain a source folder."
    }

    Invoke-Step "Copying updated application files." {
        $excludedDirs = @(
            ".git",
            "node_modules",
            "apps\api\node_modules",
            "apps\web\node_modules",
            "apps\api\data",
            "apps\api\profiles",
            "apps\web\dist",
            "backups",
            "logs",
            "build"
        ) | ForEach-Object { Join-Path $sourceRoot.FullName $_ }

        $excludedFiles = @(
            (Join-Path $sourceRoot.FullName ".env"),
            (Join-Path $sourceRoot.FullName "apps\api\.env")
        )

        $robocopyArgs = @(
            $sourceRoot.FullName,
            $RepoRoot,
            "/E",
            "/NFL",
            "/NDL",
            "/NJH",
            "/NJS",
            "/NP",
            "/XD"
        ) + $excludedDirs + @("/XF") + $excludedFiles

        Invoke-NativeCommand -FilePath "robocopy.exe" -Arguments $robocopyArgs -MaxSuccessfulExitCode 7 | Out-Null
    }

    Invoke-Step "Installing API dependencies." {
        Push-Location (Join-Path $RepoRoot "apps\api")
        try {
            Invoke-NativeCommand -FilePath (Get-NpmCommand) -Arguments @("install") | Out-Null
        }
        finally {
            Pop-Location
        }
    }

    Invoke-Step "Installing web dependencies and rebuilding the dashboard." {
        Push-Location (Join-Path $RepoRoot "apps\web")
        try {
            $npm = Get-NpmCommand
            Invoke-NativeCommand -FilePath $npm -Arguments @("install") | Out-Null
            Invoke-NativeCommand -FilePath $npm -Arguments @("run", "build") | Out-Null
        }
        finally {
            Pop-Location
        }
    }

    Write-UpdateState -Status "success" -Message "Update to $TargetTag installed. Restart SST to load the new API code."
    Write-UpdateLog "Update complete. Restart SST to load the new API code."
    exit 0
}
catch {
    Write-UpdateState -Status "failed" -Message $_.Exception.Message
    Write-UpdateLog "FAILED: $($_.Exception.Message)"
    if ($_.ScriptStackTrace) {
        Write-UpdateLog $_.ScriptStackTrace
    }
    Write-Error $_
    exit 1
}
