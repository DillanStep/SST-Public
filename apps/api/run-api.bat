@echo off
title SST API - DayZ Management Suite

cd /d "%~dp0"

:loop
echo.
echo ============================================================
echo  SST API - DayZ Management Suite
echo  http://localhost:3001
echo ============================================================
echo.

node src/server.js

echo.
echo ============================================================
echo  SST API stopped. Restarting in 3 seconds...
echo (Press Ctrl+C to exit)
echo ============================================================

ping 127.0.0.1 -n 4 > nul
goto loop
