@echo off
REM ============================================================
REM SST Dashboard - Factory Reset
REM ============================================================

setlocal
title SST Factory Reset

PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reset-Factory.ps1" %*
set "RESULT=%ERRORLEVEL%"

if "%RESULT%"=="2" (
    echo.
    echo Reset could not finish because one or more files are still open.
    echo Close SST/API/Web/Node windows, then run this reset again.
) else if not "%RESULT%"=="0" (
    echo.
    echo Factory reset failed with exit code %RESULT%.
)

echo.
pause
exit /b %RESULT%
