@echo off
SETLOCAL ENABLEDELAYEDEXPANSION
SET "SCRIPT_DIR=%~dp0"
FOR %%I IN ("%SCRIPT_DIR%..\..") DO SET "REPO_ROOT=%%~fI"
SET "DAYZ_ROOT=%REPO_ROOT%\dayz"

SET "drive=P:/"
:check
IF NOT EXIST %drive% (
	SET /p "drive=Enter Drive Letter (P:/):"
	goto check
)

REM Link DayZ workbench template projects into the work drive.
FOR /D %%D IN ("%DAYZ_ROOT%\workbench-template\*") DO (
    REM Check for gproj file
    IF EXIST "%%D\Workbench\dayz.gproj" (
        REM Create a junction between the "Workbench" folder and P:\FolderName
        SET "junctionPath=%drive%\%%~nxD"
        ECHO Creating junction for "%%D" to "!junctionPath!"
        MKLINK /J "!junctionPath!" "%%D"
    )
)

IF EXIST "%DAYZ_ROOT%\Dependencies" (
for /d %%d in ("%DAYZ_ROOT%\Dependencies\*") do (
    echo Creating junction for "%%d" to "%drive%/%%~nxd"
    mklink /j "%drive%/%%~nxd" "%%d"
)
)

ENDLOCAL
