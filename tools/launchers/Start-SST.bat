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
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "API_DIR=%REPO_ROOT%\apps\api"
set "WEB_DIR=%REPO_ROOT%\apps\web"
set "RESET_CLIENT_FLAG=%REPO_ROOT%\.sst-reset-client.flag"
set "API_PORT=%PORT%"
if not defined API_PORT (
    set "API_PORT=3001"
    if exist "%API_DIR%\.env" (
        for /f "usebackq tokens=1,* delims==" %%A in ("%API_DIR%\.env") do (
            if /I "%%A"=="PORT" set "API_PORT=%%B"
        )
    )
)
if "%API_PORT%"=="" set "API_PORT=3001"
set "PORT=%API_PORT%"
set "API_URL=http://localhost:%API_PORT%"

echo Project: %REPO_ROOT%
echo API:     %API_DIR%
echo URL:     %API_URL%
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

REM Check if an API is already running. Prefer the configured port, but
REM also detect the default port so the launcher opens the working server.
echo Checking if API is already running...
set "RUNNING_API_PORT="
for %%P in (%API_PORT% 3001) do (
    if not defined RUNNING_API_PORT (
        curl.exe -fsS "http://localhost:%%P/health" > nul 2> nul
        if not errorlevel 1 set "RUNNING_API_PORT=%%P"
    )
)
if defined RUNNING_API_PORT (
    set "API_PORT=%RUNNING_API_PORT%"
    set "PORT=%RUNNING_API_PORT%"
    set "API_URL=http://localhost:%RUNNING_API_PORT%"
    echo.
    echo SST API is already running on port %RUNNING_API_PORT%.
    echo Opening browser to existing server...
    echo.
    goto :open_browser
)

REM Start API with auto-restart
echo Starting API server...
cd /d "%API_DIR%"
start "SST API" run-api.bat

echo Waiting for API...
call :wait_for_health "%API_URL%/health" 20
if not errorlevel 1 goto :open_browser
if not "%API_PORT%"=="3001" (
    curl.exe -fsS "http://localhost:3001/health" > nul 2> nul
    if not errorlevel 1 (
        set "API_PORT=3001"
        set "PORT=3001"
        set "API_URL=http://localhost:3001"
        goto :open_browser
    )
)
echo WARNING: API did not respond at %API_URL%/health yet. Opening browser anyway.

:open_browser
REM Open browser
echo Opening browser...
if "%SST_NO_BROWSER%"=="1" (
    echo Browser launch skipped because SST_NO_BROWSER=1.
    goto :after_browser
)

if exist "%WEB_DIR%\dist\index.html" (
    if exist "%RESET_CLIENT_FLAG%" (
        del /q "%RESET_CLIENT_FLAG%" >nul 2>nul
        start %API_URL%/reset-client.html?return=/
    ) else (
        start %API_URL%
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

:after_browser
echo.
echo ============================================================
echo  SST is running at %API_URL%
echo Close the API window to stop.
echo ============================================================
echo.
if "%SST_NO_PAUSE%"=="1" exit /b 0
pause
exit /b 0

:wait_for_health
set "HEALTH_URL=%~1"
set "HEALTH_ATTEMPTS=%~2"
for /l %%I in (1,1,%HEALTH_ATTEMPTS%) do (
    curl.exe -fsS "%HEALTH_URL%" > nul 2> nul
    if not errorlevel 1 exit /b 0
    ping 127.0.0.1 -n 2 > nul
)
exit /b 1
