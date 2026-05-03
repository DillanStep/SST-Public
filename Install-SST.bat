@echo off
REM ============================================================
REM SST Dashboard - Installation Script
REM ============================================================
REM This script installs all dependencies for SST.
REM Run this once after extracting the SST package.
REM ============================================================

title SST Dashboard Installer

echo.
echo ============================================================
echo            SST Dashboard Installer
echo ============================================================
echo.

REM Check if Node.js is installed
echo Checking for Node.js...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH.
    echo.
    echo Please install Node.js LTS from: https://nodejs.org/
    echo After installation, run this installer again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo Found Node.js %NODE_VERSION%
echo.

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"
set "API_DIR=%SCRIPT_DIR%apps\api"
set "WEB_DIR=%SCRIPT_DIR%apps\web"

REM Verify folder structure
echo Verifying folder structure...
if not exist "%API_DIR%\package.json" (
    echo ERROR: API folder not found at %API_DIR%
    echo Make sure this script is in the SST root folder.
    pause
    exit /b 1
)
if not exist "%WEB_DIR%\package.json" (
    echo ERROR: Web folder not found at %WEB_DIR%
    echo Make sure this script is in the SST root folder.
    pause
    exit /b 1
)
echo Folder structure OK.
echo.

REM Install API dependencies
echo ============================================================
echo Installing API dependencies...
echo ============================================================
cd /d "%API_DIR%"
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Failed to install API dependencies.
    pause
    exit /b 1
)
echo API dependencies installed.
echo.

REM Install Web dependencies
echo ============================================================
echo Installing Web Client dependencies...
echo ============================================================
cd /d "%WEB_DIR%"
call npm install
if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Failed to install Web dependencies.
    pause
    exit /b 1
)
echo Web dependencies installed.
echo.

REM Build the web client for production
echo ============================================================
echo Building Web Client for production...
echo ============================================================
call npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo WARNING: Web build failed. You can still use dev mode.
    echo.
) else (
    echo Web client built successfully.
)
echo.

REM Create default .env if it doesn't exist
if not exist "%API_DIR%\.env" (
    echo Creating default API configuration...
    if exist "%API_DIR%\.env.example" (
        copy "%API_DIR%\.env.example" "%API_DIR%\.env" >nul
        echo Default .env created from .env.example
    ) else (
        echo PORT=3001> "%API_DIR%\.env"
        echo API_KEY=>> "%API_DIR%\.env"
        echo Created minimal .env file
    )
    echo.
)

echo.
echo ============================================================
echo.
echo   INSTALLATION COMPLETE!
echo.
echo   To start SST Dashboard:
echo.
echo   1. Double-click "Start-SST.bat"
echo.
echo   2. Your browser will open to the setup wizard
echo.
echo   3. Follow the on-screen instructions to:
echo      - Configure your DayZ server connection (Local/SFTP/FTP)
echo      - Create your admin account
echo.
echo   NOTE: Install @SST on the DayZ server and start the
echo   DayZ server once before testing the connection.
echo   SST must generate the DayZ profile SST files first.
echo.
echo ============================================================
echo.
pause
