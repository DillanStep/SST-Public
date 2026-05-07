@echo off
setlocal
call "%~dp0tools\launchers\Install-SST.bat" %*
exit /b %ERRORLEVEL%
