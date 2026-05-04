@echo off
title SST API - DayZ Management Suite
echo ============================================================
echo  SST API - DayZ Management Suite
echo ============================================================
echo.
echo Starting API server on http://localhost:3001
echo.
echo Press Ctrl+C to stop the server
echo ============================================================
echo.

cd /d "%~dp0"
npm run start

pause
