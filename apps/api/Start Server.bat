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

echo ============================================================
echo  SST API - DayZ Management Suite
echo ============================================================
echo.
echo Starting API server on http://localhost:%API_PORT%
echo.
echo Press Ctrl+C to stop the server
echo ============================================================
echo.

npm run start

pause
