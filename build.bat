@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1"
set "BUILD_RESULT=%ERRORLEVEL%"
if /i "%~1"=="/s" goto done
if /i "%~1"=="--silent" goto done
if "%SILENT%"=="1" goto done
pause
:done
exit /b %BUILD_RESULT%
