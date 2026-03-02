@echo off
setlocal
cd /d "%~dp0"
if not exist ".env.local" if exist ".env.local.example" copy ".env.local.example" ".env.local" >nul
if not exist ".data\planning" mkdir ".data\planning"
if not exist ".data\ops" mkdir ".data\ops"
pnpm install --frozen-lockfile
if errorlevel 1 exit /b 1
echo [planning:v2:desktop] install complete
