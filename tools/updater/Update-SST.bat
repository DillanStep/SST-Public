@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%POWERSHELL_EXE%" set "POWERSHELL_EXE=powershell.exe"

set "REPO_ROOT="
set "ARCHIVE_URL="
set "TARGET_TAG="
set "STATE_PATH="
set "LOG_PATH="
set "DRY_RUN=0"
if not defined SST_UPDATE_REPO set "SST_UPDATE_REPO=DillanStep/SST-Public"

:parse_args
if "%~1"=="" goto validate_args
if /I "%~1"=="--repo-root" (
  set "REPO_ROOT=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="--archive-url" (
  set "ARCHIVE_URL=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="--target-tag" (
  set "TARGET_TAG=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="--state-path" (
  set "STATE_PATH=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="--log-path" (
  set "LOG_PATH=%~2"
  shift
  shift
  goto parse_args
)
if /I "%~1"=="--dry-run" (
  set "DRY_RUN=1"
  shift
  goto parse_args
)
echo Unknown argument: %~1
exit /b 2

:validate_args
if not defined REPO_ROOT (
  for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
)
if not defined STATE_PATH (
  set "STATE_PATH=%REPO_ROOT%\apps\api\data\update-state.json"
)
if not defined LOG_PATH (
  call :default_log_path
  if errorlevel 1 exit /b 1
)

for %%I in ("%LOG_PATH%") do set "LOG_DIR=%%~dpI"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>nul

if not defined TARGET_TAG (
  call :resolve_latest_release
  if errorlevel 1 exit /b 1
)
if not defined ARCHIVE_URL (
  set "ARCHIVE_URL=https://github.com/%SST_UPDATE_REPO%/archive/refs/tags/%TARGET_TAG%.zip"
)

call :log "SST updater launcher started."
call :log "Repo root: %REPO_ROOT%"
call :log "Target tag: %TARGET_TAG%"
call :write_state running "Launching updater for %TARGET_TAG%."

if not exist "%SCRIPT_DIR%Update-SST.ps1" (
  call :fail "PowerShell updater script not found at %SCRIPT_DIR%Update-SST.ps1"
  exit /b 1
)

if "%DRY_RUN%"=="1" (
  call :log "Dry run completed. PowerShell updater was not started."
  call :write_state success "Dry run completed for %TARGET_TAG%."
  exit /b 0
)

set "UPDATER_PS1=%SCRIPT_DIR%Update-SST.ps1"
call :prepare_target_updater

call :log "Starting PowerShell updater: %UPDATER_PS1%"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%UPDATER_PS1%" -RepoRoot "%REPO_ROOT%" -ArchiveUrl "%ARCHIVE_URL%" -TargetTag "%TARGET_TAG%" -StatePath "%STATE_PATH%" -LogPath "%LOG_PATH%"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  call :log "FAILED: Updater process exited with code %EXIT_CODE%. See the update log for details."
  exit /b %EXIT_CODE%
)

call :log "SST updater launcher finished."
exit /b 0

:log
echo [%DATE% %TIME%] %~1
>> "%LOG_PATH%" echo [%DATE% %TIME%] %~1
exit /b 0

:write_state
set "SST_UPDATE_STATUS=%~1"
set "SST_UPDATE_MESSAGE=%~2"
set "SST_TARGET_TAG=%TARGET_TAG%"
set "SST_LOG_PATH=%LOG_PATH%"
set "SST_STATE_PATH=%STATE_PATH%"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $stateDir = Split-Path -Parent $env:SST_STATE_PATH; if ($stateDir) { New-Item -ItemType Directory -Force -Path $stateDir | Out-Null }; $state = [ordered]@{ status = $env:SST_UPDATE_STATUS; message = $env:SST_UPDATE_MESSAGE; targetTag = $env:SST_TARGET_TAG; logPath = $env:SST_LOG_PATH; updatedAt = (Get-Date).ToUniversalTime().ToString('o') }; $json = $state | ConvertTo-Json -Depth 4; $utf8NoBom = New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($env:SST_STATE_PATH, $json, $utf8NoBom)" >> "%LOG_PATH%" 2>&1
exit /b 0

:default_log_path
for /f %%I in ('"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "Get-Date -Format yyyy-MM-ddTHH-mm-ss"') do set "UPDATE_TIMESTAMP=%%I"
if not defined UPDATE_TIMESTAMP set "UPDATE_TIMESTAMP=manual"
set "LOG_PATH=%REPO_ROOT%\logs\update-%UPDATE_TIMESTAMP%.log"
exit /b 0

:resolve_latest_release
call :log "Resolving latest release from %SST_UPDATE_REPO%."
set "SST_RELEASE_INFO=%TEMP%\sst-release-%RANDOM%-%RANDOM%.txt"
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $repo = $env:SST_UPDATE_REPO; $release = Invoke-RestMethod -Headers @{ 'User-Agent' = 'SST-Updater' } -Uri ('https://api.github.com/repos/' + $repo + '/releases/latest'); $tag = [string]$release.tag_name; if (-not $tag) { throw 'Latest release does not have a tag.' }; $archive = 'https://github.com/' + $repo + '/archive/refs/tags/' + $tag + '.zip'; $utf8NoBom = New-Object System.Text.UTF8Encoding($false); [System.IO.File]::WriteAllText($env:SST_RELEASE_INFO, ($tag + '|' + $archive), $utf8NoBom)" >> "%LOG_PATH%" 2>&1
if errorlevel 1 (
  call :fail "Could not resolve the latest GitHub release for %SST_UPDATE_REPO%."
  exit /b 1
)
for /f "usebackq tokens=1,* delims=|" %%A in ("%SST_RELEASE_INFO%") do (
  set "TARGET_TAG=%%A"
  set "ARCHIVE_URL=%%B"
)
del "%SST_RELEASE_INFO%" >nul 2>nul
if not defined TARGET_TAG (
  call :fail "Could not resolve the latest GitHub release for %SST_UPDATE_REPO%."
  exit /b 1
)
exit /b 0

:prepare_target_updater
set "TARGET_UPDATER_PS1=%TEMP%\sst-updater-%TARGET_TAG%-%RANDOM%-%RANDOM%.ps1"
set "SST_TARGET_UPDATER_URL=https://raw.githubusercontent.com/%SST_UPDATE_REPO%/%TARGET_TAG%/tools/updater/Update-SST.ps1"
set "SST_TARGET_UPDATER_PATH=%TARGET_UPDATER_PS1%"
call :log "Checking target release updater script."
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = 'Stop'; $uri = $env:SST_TARGET_UPDATER_URL; $out = $env:SST_TARGET_UPDATER_PATH; Invoke-WebRequest -Uri $uri -OutFile $out -UseBasicParsing; if ((Get-Item -LiteralPath $out).Length -lt 1000) { throw 'Downloaded updater script was unexpectedly small.' }" >> "%LOG_PATH%" 2>&1
if errorlevel 1 (
  call :log "Could not download target release updater. Falling back to local updater."
  del "%TARGET_UPDATER_PS1%" >nul 2>nul
  exit /b 0
)
set "UPDATER_PS1=%TARGET_UPDATER_PS1%"
call :log "Using target release updater script."
exit /b 0

:fail
set "FAIL_MESSAGE=%~1"
call :log "FAILED: %FAIL_MESSAGE%"
call :write_state failed "%FAIL_MESSAGE%"
exit /b 1
