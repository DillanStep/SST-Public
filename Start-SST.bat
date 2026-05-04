@echo off
setlocal
title SST - DayZ Management Suite

echo.
echo ============================================================
echo  SST - DayZ Management Suite
echo  Dashboard Launcher
echo ============================================================
echo.

set "SCRIPT_DIR=%~dp0"
set "API_DIR=%SCRIPT_DIR%apps\api"
set "WEB_DIR=%SCRIPT_DIR%apps\web"
set "RESET_CLIENT_FLAG=%SCRIPT_DIR%.sst-reset-client.flag"

echo Project: %SCRIPT_DIR%
echo API:     %API_DIR%
echo.

REM Check Node.js
echo Checking Node.js...
node --version
if errorlevel 1 (
    echo.
    echo ERROR: Node.js not found. Install from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
echo.

REM Check API exists
if not exist "%API_DIR%\src\server.js" (
    echo ERROR: API not found at %API_DIR%
    pause
    exit /b 1
)
echo API files found.
echo.

REM Check/install dependencies
echo Checking dependencies...
if not exist "%API_DIR%\node_modules" (
    echo Installing API dependencies - please wait...
    cd /d "%API_DIR%"
    call npm install
    echo Done.
)
echo.

REM Check if port 3001 is already in use
echo Checking if API is already running...
netstat -ano | findstr ":3001.*LISTENING" > nul
if not errorlevel 1 (
    echo.
    echo SST API is already running on port 3001.
    echo Opening browser to existing server...
    echo.
    goto :open_browser
)

REM Start API with auto-restart
echo Starting API server...
cd /d "%API_DIR%"
start "SST API" run-api.bat

echo Waiting for API...
ping 127.0.0.1 -n 4 > nul

:open_browser
REM Open browser
echo Opening browser...
if exist "%WEB_DIR%\dist\index.html" (
    if exist "%RESET_CLIENT_FLAG%" (
        del /q "%RESET_CLIENT_FLAG%" >nul 2>nul
        start http://localhost:3001/reset-client.html?return=/
    ) else (
        start http://localhost:3001
    )
) else (
    echo Web not built - checking dev mode...
    if not exist "%WEB_DIR%\node_modules" (
        echo Installing web dependencies...
        cd /d "%WEB_DIR%"
        call npm install
    )
    echo Starting dev server...
    cd /d "%WEB_DIR%"
    start "SST Web" cmd /k npm run dev
    ping 127.0.0.1 -n 4 > nul
    if exist "%RESET_CLIENT_FLAG%" (
        del /q "%RESET_CLIENT_FLAG%" >nul 2>nul
        start http://localhost:5173/reset-client.html?return=/
    ) else (
        start http://localhost:5173
    )
)

echo.
echo ============================================================
echo  SST is running at http://localhost:3001
echo Close the API window to stop.
echo ============================================================
echo.
pause
