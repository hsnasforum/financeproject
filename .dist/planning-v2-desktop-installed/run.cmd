@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3100
pnpm dev -- --host 127.0.0.1 --port %PORT%
