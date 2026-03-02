@echo off
setlocal
cd /d "%~dp0"
echo [planning:v2:desktop] uninstall started (binaries only)
node scripts/planning_v2_desktop_uninstall.mjs --target "%CD%"
