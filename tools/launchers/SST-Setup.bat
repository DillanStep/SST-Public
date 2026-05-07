@echo off
setlocal
title SST Setup

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"

:menu
cls
echo.
echo ============================================================
echo  SST - All-in-One Setup
echo ============================================================
echo.
echo  1. Install or repair SST
echo  2. Start SST
echo  3. Reset to defaults, then install as new
echo  4. Factory reset only
echo  5. Exit
echo.
choice /c 12345 /n /m "Choose an option: "

if errorlevel 5 goto :done
if errorlevel 4 goto :reset_only
if errorlevel 3 goto :reset_install
if errorlevel 2 goto :start_sst
if errorlevel 1 goto :install

:install
call "%SCRIPT_DIR%Install-SST.bat"
echo.
set /p START_NOW="Start SST now? (yes/no): "
if /i "%START_NOW%"=="yes" (
    call "%SCRIPT_DIR%Start-SST.bat"
)
goto :menu

:start_sst
call "%SCRIPT_DIR%Start-SST.bat"
goto :menu

:reset_install
echo.
echo WARNING: This will delete local SST setup data and API users.
echo It will also ask the browser to clear saved SST server/login state on next start.
echo.
set /p CONFIRM="Type RESET to continue: "
if /i not "%CONFIRM%"=="RESET" (
    echo Cancelled.
    pause
    goto :menu
)

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%REPO_ROOT%\tools\maintenance\Reset-Factory.ps1" -Force
if errorlevel 1 (
    echo.
    echo Reset failed. Install was not started.
    pause
    goto :menu
)

call "%SCRIPT_DIR%Install-SST.bat"
echo.
set /p START_NOW="Start SST now? (yes/no): "
if /i "%START_NOW%"=="yes" (
    call "%SCRIPT_DIR%Start-SST.bat"
)
goto :menu

:reset_only
call "%REPO_ROOT%\tools\maintenance\Reset-Factory.bat"
goto :menu

:done
exit /b 0
