@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "OUTPUT_DIR=%REPO_ROOT%\build\SST-Manager"

echo.
echo ============================================================
echo  Building SST Manager
echo ============================================================
echo.
echo Output: %OUTPUT_DIR%
echo.

PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$repo = [System.IO.Path]::GetFullPath('%REPO_ROOT%');" ^
  "$project = [System.IO.Path]::GetFullPath('%SCRIPT_DIR%');" ^
  "$output = [System.IO.Path]::GetFullPath('%OUTPUT_DIR%');" ^
  "$ids = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'SST Manager.exe' -and $_.ExecutablePath -and [System.IO.Path]::GetFullPath($_.ExecutablePath).StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase) } | Select-Object -ExpandProperty ProcessId);" ^
  "foreach ($id in $ids) { Write-Host ('Stopping stale SST Manager process ' + $id); Stop-Process -Id $id -Force -ErrorAction SilentlyContinue };" ^
  "foreach ($id in $ids) { try { Wait-Process -Id $id -Timeout 10 -ErrorAction SilentlyContinue } catch {} };" ^
  "$expected = [System.IO.Path]::GetFullPath((Join-Path $repo 'build\SST-Manager'));" ^
  "if (-not $output.StartsWith($expected, [System.StringComparison]::OrdinalIgnoreCase)) { throw ('Refusing to clean unexpected output path: ' + $output) };" ^
  "if (Test-Path -LiteralPath $output) { $removed = $false; for ($i = 1; $i -le 20 -and -not $removed; $i++) { try { Remove-Item -LiteralPath $output -Recurse -Force -ErrorAction Stop; $removed = $true } catch { if ($i -eq 20) { throw }; Start-Sleep -Milliseconds 300 } } };" ^
  "foreach ($name in @('bin', 'obj')) { $path = [System.IO.Path]::GetFullPath((Join-Path $project $name)); if (-not $path.StartsWith($project, [System.StringComparison]::OrdinalIgnoreCase)) { throw ('Refusing to clean unexpected project path: ' + $path) }; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force } };" ^
  "New-Item -ItemType Directory -Force -Path $output | Out-Null"
if errorlevel 1 (
  echo.
  echo SST Manager output cleanup failed.
  exit /b 1
)

dotnet restore "%SCRIPT_DIR%SST.Manager.csproj" -r win-x64
if errorlevel 1 (
  echo.
  echo SST Manager restore failed.
  exit /b 1
)

dotnet publish "%SCRIPT_DIR%SST.Manager.csproj" ^
  -c Release ^
  -r win-x64 ^
  --self-contained true ^
  -p:PublishSingleFile=true ^
  -p:IncludeNativeLibrariesForSelfExtract=true ^
  -p:EnableCompressionInSingleFile=true ^
  -p:DebugType=None ^
  -p:DebugSymbols=false ^
  -o "%OUTPUT_DIR%"

if errorlevel 1 (
  echo.
  echo SST Manager build failed.
  exit /b 1
)

echo.
echo Built: %OUTPUT_DIR%\SST Manager.exe
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$path = '%OUTPUT_DIR%\SST Manager.exe';" ^
  "$file = Get-Item -LiteralPath $path;" ^
  "$sha = [System.Security.Cryptography.SHA256]::Create();" ^
  "$stream = [System.IO.File]::OpenRead($path);" ^
  "try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') } finally { $stream.Dispose(); $sha.Dispose() };" ^
  "Write-Host ('File: ' + $file.FullName);" ^
  "Write-Host ('Size: ' + $file.Length);" ^
  "Write-Host ('Built: ' + $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'));" ^
  "Write-Host ('SHA256: ' + $hash)"
exit /b 0
