@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.local" if exist ".env.local.example" copy ".env.local.example" ".env.local" >nul
pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1
set TARGET=%CD%\run.cmd
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $programs = [Environment]::GetFolderPath('Programs'); $paths = @((Join-Path $desktop 'Planning v2.lnk'), (Join-Path $programs 'Planning v2.lnk')); foreach ($p in $paths) { $s = $ws.CreateShortcut($p); $s.TargetPath = '%TARGET%'; $s.WorkingDirectory = '%CD%'; $s.IconLocation = '%TARGET%'; $s.Save() }"
echo [planning:v2:desktop] install complete
