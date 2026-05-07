@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Clean-Workspace.ps1" %*
exit /b %ERRORLEVEL%
