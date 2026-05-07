@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_ROOT=%%~fI"
set "OUTPUT_DIR=%REPO_ROOT%\build\SST-Installer"
set "STAGE_DIR=%OUTPUT_DIR%\payload"
set "PAYLOAD_ZIP=%SCRIPT_DIR%assets\sst-payload.zip"

echo.
echo ============================================================
echo  Building SST Setup
echo ============================================================
echo.

call "%REPO_ROOT%\tools\manager\Build-SST-Manager.bat"
if errorlevel 1 exit /b 1

echo.
echo Preparing installer payload...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$repo = [System.IO.Path]::GetFullPath('%REPO_ROOT%');" ^
  "$stage = [System.IO.Path]::GetFullPath('%STAGE_DIR%');" ^
  "$payloadRoot = Join-Path $stage 'SST';" ^
  "$zip = [System.IO.Path]::GetFullPath('%PAYLOAD_ZIP%');" ^
  "$installerProject = [System.IO.Path]::GetFullPath('%SCRIPT_DIR%');" ^
  "foreach ($path in @('%OUTPUT_DIR%', $stage, (Split-Path -Parent $zip))) { if ($path) { New-Item -ItemType Directory -Force -Path $path | Out-Null } };" ^
  "if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force };" ^
  "New-Item -ItemType Directory -Force -Path $payloadRoot | Out-Null;" ^
  "if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force };" ^
  "$excludedSegments = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase);" ^
  "foreach ($segment in @('.git','node_modules','bin','obj','logs','backups')) { [void]$excludedSegments.Add($segment) };" ^
  "$excludedPrefixes = @('build','apps\api\data','apps\api\profiles','tools\installer\assets');" ^
  "$files = Get-ChildItem -LiteralPath $repo -Recurse -File -Force;" ^
  "foreach ($file in $files) {" ^
  "  $rel = $file.FullName.Substring($repo.Length).TrimStart('\');" ^
  "  $segments = $rel -split '\\';" ^
  "  $skip = $false;" ^
  "  $dirSegments = if ($segments.Length -gt 1) { $segments[0..($segments.Length - 2)] } else { @() };" ^
  "  foreach ($segment in $dirSegments) { if ($segment.StartsWith('.')) { $skip = $true; break } }" ^
  "  foreach ($segment in $segments) { if ($excludedSegments.Contains($segment) -or ($segment.StartsWith('.') -and $segment.EndsWith('-logs'))) { $skip = $true; break } }" ^
  "  foreach ($prefix in $excludedPrefixes) { if ($rel.Equals($prefix, [System.StringComparison]::OrdinalIgnoreCase) -or $rel.StartsWith($prefix + '\', [System.StringComparison]::OrdinalIgnoreCase)) { $skip = $true; break } }" ^
  "  if ($file.Name.Equals('.env', [System.StringComparison]::OrdinalIgnoreCase)) { $skip = $true }" ^
  "  if ($file.Name.StartsWith('.env.', [System.StringComparison]::OrdinalIgnoreCase) -and -not @('.env.example','.env.docker').Contains($file.Name)) { $skip = $true }" ^
  "  if ($skip) { continue }" ^
  "  $dest = Join-Path $payloadRoot $rel;" ^
  "  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null;" ^
  "  Copy-Item -LiteralPath $file.FullName -Destination $dest -Force;" ^
  "}" ^
  "$modDir = Join-Path $payloadRoot 'dayz\server-mod\@SST';" ^
  "$modPbo = Join-Path $modDir 'Addons\SST.pbo';" ^
  "if (-not (Test-Path -LiteralPath $modPbo)) { throw 'Bundled @SST mod was not found in the installer payload.' }" ^
  "$modSize = (Get-Item -LiteralPath $modPbo).Length;" ^
  "Write-Host ('Bundled mod: ' + $modDir);" ^
  "Write-Host ('Bundled mod PBO size: ' + $modSize);" ^
  "$managerExe = Join-Path $repo 'build\SST-Manager\SST Manager.exe';" ^
  "if (-not (Test-Path -LiteralPath $managerExe)) { throw 'Built SST Manager.exe was not found.' }" ^
  "$managerDest = Join-Path $payloadRoot 'build\SST-Manager\SST Manager.exe';" ^
  "New-Item -ItemType Directory -Force -Path (Split-Path -Parent $managerDest) | Out-Null;" ^
  "Copy-Item -LiteralPath $managerExe -Destination $managerDest -Force;" ^
  "Compress-Archive -Path (Join-Path $payloadRoot '*') -DestinationPath $zip -Force;" ^
  "$payload = Get-Item -LiteralPath $zip;" ^
  "Write-Host ('Payload: ' + $payload.FullName);" ^
  "Write-Host ('Payload size: ' + $payload.Length)"
if errorlevel 1 (
  echo.
  echo SST setup payload build failed.
  exit /b 1
)

echo.
echo Publishing SST Setup.exe...
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference = 'Stop';" ^
  "$project = [System.IO.Path]::GetFullPath('%SCRIPT_DIR%');" ^
  "$output = [System.IO.Path]::GetFullPath('%OUTPUT_DIR%');" ^
  "foreach ($name in @('bin','obj')) { $path = Join-Path $project $name; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force } };" ^
  "$publish = Join-Path $output 'publish';" ^
  "if (Test-Path -LiteralPath $publish) { Remove-Item -LiteralPath $publish -Recurse -Force };" ^
  "New-Item -ItemType Directory -Force -Path $publish | Out-Null"
if errorlevel 1 exit /b 1

dotnet restore "%SCRIPT_DIR%SST.Installer.csproj" -r win-x64
if errorlevel 1 exit /b 1

dotnet publish "%SCRIPT_DIR%SST.Installer.csproj" ^
  -c Release ^
  -r win-x64 ^
  --self-contained true ^
  -p:PublishSingleFile=true ^
  -p:IncludeNativeLibrariesForSelfExtract=true ^
  -p:EnableCompressionInSingleFile=true ^
  -p:DebugType=None ^
  -p:DebugSymbols=false ^
  -o "%OUTPUT_DIR%\publish"

if errorlevel 1 (
  echo.
  echo SST Setup build failed.
  exit /b 1
)

echo.
echo Built: %OUTPUT_DIR%\publish\SST Setup.exe
PowerShell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$path = '%OUTPUT_DIR%\publish\SST Setup.exe';" ^
  "$file = Get-Item -LiteralPath $path;" ^
  "$sha = [System.Security.Cryptography.SHA256]::Create();" ^
  "$stream = [System.IO.File]::OpenRead($path);" ^
  "try { $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') } finally { $stream.Dispose(); $sha.Dispose() };" ^
  "Write-Host ('File: ' + $file.FullName);" ^
  "Write-Host ('Size: ' + $file.Length);" ^
  "Write-Host ('Built: ' + $file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'));" ^
  "Write-Host ('SHA256: ' + $hash)"

exit /b 0
