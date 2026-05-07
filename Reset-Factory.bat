@echo off
setlocal
call "%~dp0tools\maintenance\Reset-Factory.bat" %*
exit /b %ERRORLEVEL%
