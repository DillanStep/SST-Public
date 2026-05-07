@echo off
title SST API - DayZ Management Suite

cd /d "%~dp0"
set "API_PORT=%PORT%"
if not defined API_PORT (
    set "API_PORT=3001"
    if exist ".env" (
        for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
            if /I "%%A"=="PORT" set "API_PORT=%%B"
        )
    )
)
if "%API_PORT%"=="" set "API_PORT=3001"
set "PORT=%API_PORT%"

:loop
echo.
echo ============================================================
echo  SST API - DayZ Management Suite
echo  http://localhost:%API_PORT%
echo ============================================================
echo.

curl.exe -fsS "http://localhost:%API_PORT%/health" > nul 2> nul
if not errorlevel 1 (
    echo SST API is already running at http://localhost:%API_PORT%
    echo This runner will exit instead of starting a duplicate server.
    echo.
    exit /b 0
)

netstat -ano | findstr ":%API_PORT%.*LISTENING" > nul
if not errorlevel 1 (
    echo ERROR: Port %API_PORT% is already in use, but it did not answer /health.
    echo Close the process using this port or change PORT in .env.
    echo.
    exit /b 1
)

node src/server.js

curl.exe -fsS "http://localhost:%API_PORT%/health" > nul 2> nul
if not errorlevel 1 (
    echo.
    echo SST API is already running at http://localhost:%API_PORT%.
    echo Stopping this runner to avoid a duplicate restart loop.
    echo.
    exit /b 0
)

echo.
echo ============================================================
echo  SST API stopped. Restarting in 3 seconds...
echo (Press Ctrl+C to exit)
echo ============================================================

ping 127.0.0.1 -n 4 > nul
goto loop
