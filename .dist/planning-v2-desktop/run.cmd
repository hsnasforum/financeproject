@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3100
set PLANNING_PACKAGED_MODE=1
set PLANNING_RUNTIME_MODE=packaged
if "%PLANNING_APP_NAME%"=="" set PLANNING_APP_NAME=PlanningV2
node scripts/planning_v2_desktop_launch.mjs --runtime prod --port %PORT% --path /planning
