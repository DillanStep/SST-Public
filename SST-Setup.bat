@echo off
setlocal
call "%~dp0tools\launchers\SST-Setup.bat" %*
exit /b %ERRORLEVEL%
