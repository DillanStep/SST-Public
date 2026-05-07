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
$transcriptStarted = $false

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

function Invoke-Step {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Script
    )

    Write-UpdateState -Status "running" -Message $Message
    Write-Host $Message
    & $Script
}

$logDir = Split-Path -Parent $LogPath
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}

try {
    try {
        Start-Transcript -Path $LogPath -Append -ErrorAction Stop | Out-Null
        $transcriptStarted = $true
    }
    catch {
        Write-Warning "Could not start transcript logging. Continuing with launcher log redirection. $($_.Exception.Message)"
    }

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
        Invoke-WebRequest -Uri $ArchiveUrl -OutFile $zipPath -UseBasicParsing
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
            Join-Path $sourceRoot.FullName ".env",
            Join-Path $sourceRoot.FullName "apps\api\.env"
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

        & robocopy @robocopyArgs
        if ($LASTEXITCODE -gt 7) {
            throw "Robocopy failed with exit code $LASTEXITCODE."
        }
    }

    Invoke-Step "Installing API dependencies." {
        Push-Location (Join-Path $RepoRoot "apps\api")
        try {
            npm install
        }
        finally {
            Pop-Location
        }
    }

    Invoke-Step "Installing web dependencies and rebuilding the dashboard." {
        Push-Location (Join-Path $RepoRoot "apps\web")
        try {
            npm install
            npm run build
        }
        finally {
            Pop-Location
        }
    }

    Write-UpdateState -Status "success" -Message "Update to $TargetTag installed. Restart SST to load the new API code."
    Write-Host "Update complete. Restart SST to load the new API code."
    exit 0
}
catch {
    Write-UpdateState -Status "failed" -Message $_.Exception.Message
    Write-Error $_
    exit 1
}
finally {
    if ($transcriptStarted) {
        try {
            Stop-Transcript | Out-Null
        }
        catch {
            # Transcript may not have started.
        }
    }
}
