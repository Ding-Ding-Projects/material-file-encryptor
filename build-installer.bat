@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" -Installer
set "BUILD_RESULT=%ERRORLEVEL%"
if /i not "%~1"=="/s" pause
exit /b %BUILD_RESULT%
