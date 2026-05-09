@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "ROOT=%%~fI\"
set "PROJECT=%ROOT:~0,-1%"
set "SOURCE=%ROOT%dayz\mod-source\SST_Leaderboard"
set "PACKAGE=%ROOT%dayz\server-mod\@SST_Leaderboard"
set "ADDONS=%PACKAGE%\Addons"
set "BUILD_DIR=%ROOT%build\pbo"
set "BACKUP_DIR=%ROOT%build\backups"
set "BUILT_PBO=%BUILD_DIR%\SST_Leaderboard.pbo"

for /f %%I in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%I"

echo.
echo === SST Leaderboard mod build ===
echo Project: "%PROJECT%"
echo.

if not exist "%SOURCE%\config.cpp" (
	echo ERROR: Could not find "%SOURCE%\config.cpp".
	exit /b 1
)

call :FindAddonBuilder
if errorlevel 1 exit /b 1

if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%" >nul 2>nul
if not exist "%ADDONS%" mkdir "%ADDONS%" >nul 2>nul

echo Building SST_Leaderboard.pbo...
"%ADDON_BUILDER%" "%SOURCE%" "%BUILD_DIR%" -packonly -clear -prefix=SST_Leaderboard -project="%PROJECT%" -toolsDirectory="%DAYZ_TOOLS%"
if errorlevel 1 (
	echo ERROR: AddonBuilder failed.
	exit /b 1
)

if not exist "%BUILT_PBO%" (
	echo ERROR: Build completed but "%BUILT_PBO%" was not created.
	exit /b 1
)

echo Updating local @SST_Leaderboard package...
call :BackupFile "%ADDONS%\SST_Leaderboard.pbo"

copy /Y "%BUILT_PBO%" "%ADDONS%\SST_Leaderboard.pbo" >nul
if errorlevel 1 (
	echo ERROR: Could not copy built PBO into "%ADDONS%".
	exit /b 1
)

echo Local package updated: "%ADDONS%\SST_Leaderboard.pbo"

set "SERVER_ROOT=%~1"
if "%SERVER_ROOT%"=="" if defined SST_SERVER_ROOT set "SERVER_ROOT=%SST_SERVER_ROOT%"
if "%SERVER_ROOT%"=="" if defined DAYZ_SERVER_ROOT set "SERVER_ROOT=%DAYZ_SERVER_ROOT%"

if not "%SERVER_ROOT%"=="" (
	call :InstallToServer "%SERVER_ROOT%"
	if errorlevel 1 exit /b 1
) else (
	echo.
	echo No server path supplied, so only the project @SST_Leaderboard package was updated.
	echo To also replace a server install, run:
	echo   tools\dayz\Build-Leaderboard.bat "C:\DayZServer"
)

echo.
echo Done.
exit /b 0

:FindAddonBuilder
if defined DAYZ_TOOLS (
	if exist "%DAYZ_TOOLS%\Bin\AddonBuilder\AddonBuilder.exe" (
		set "ADDON_BUILDER=%DAYZ_TOOLS%\Bin\AddonBuilder\AddonBuilder.exe"
		exit /b 0
	)
)

for /f "tokens=2,*" %%A in ('reg query "HKCU\SOFTWARE\Bohemia Interactive\Dayz Tools" /v "path" 2^>nul') do (
	set "DAYZ_TOOLS=%%B"
)

if defined DAYZ_TOOLS (
	if exist "%DAYZ_TOOLS%\Bin\AddonBuilder\AddonBuilder.exe" (
		set "ADDON_BUILDER=%DAYZ_TOOLS%\Bin\AddonBuilder\AddonBuilder.exe"
		exit /b 0
	)
)

if exist "C:\Program Files (x86)\Steam\steamapps\common\DayZ Tools\Bin\AddonBuilder\AddonBuilder.exe" (
	set "DAYZ_TOOLS=C:\Program Files (x86)\Steam\steamapps\common\DayZ Tools"
	set "ADDON_BUILDER=C:\Program Files (x86)\Steam\steamapps\common\DayZ Tools\Bin\AddonBuilder\AddonBuilder.exe"
	exit /b 0
)

echo ERROR: Could not find DayZ Tools AddonBuilder.
echo Install DayZ Tools, or set DAYZ_TOOLS to the DayZ Tools folder.
exit /b 1

:BackupFile
set "FILE_TO_BACKUP=%~1"
if exist "%FILE_TO_BACKUP%" (
	if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%" >nul 2>nul
	copy /Y "%FILE_TO_BACKUP%" "%BACKUP_DIR%\%~nx1.%STAMP%.bak" >nul
)
exit /b 0

:InstallToServer
set "TARGET_ROOT=%~1"
set "TARGET_MOD=%TARGET_ROOT%\@SST_Leaderboard"
set "TARGET_ADDONS=%TARGET_MOD%\Addons"

if not exist "%TARGET_ROOT%" (
	echo ERROR: Server root does not exist: "%TARGET_ROOT%"
	exit /b 1
)

tasklist /FI "IMAGENAME eq DayZServer_x64.exe" 2>nul | find /I "DayZServer_x64.exe" >nul
if not errorlevel 1 (
	echo.
	echo ERROR: DayZServer_x64.exe is running. Stop the server before replacing "%TARGET_MOD%".
	echo The local @SST_Leaderboard package has been rebuilt, but the server copy was not changed.
	exit /b 1
)

if not exist "%TARGET_ADDONS%" mkdir "%TARGET_ADDONS%" >nul 2>nul

echo.
echo Replacing server @SST_Leaderboard package: "%TARGET_MOD%"
call :BackupFile "%TARGET_ADDONS%\SST_Leaderboard.pbo"

robocopy "%PACKAGE%" "%TARGET_MOD%" /E /NFL /NDL /NJH /NJS /NC /NS >nul
if errorlevel 8 (
	echo ERROR: Failed to copy @SST_Leaderboard to "%TARGET_MOD%".
	exit /b 1
)

echo Server package updated. Restart the DayZ server to load the new PBO.
exit /b 0
