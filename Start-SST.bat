@echo off
setlocal
call "%~dp0tools\launchers\Start-SST.bat" %*
exit /b %ERRORLEVEL%
