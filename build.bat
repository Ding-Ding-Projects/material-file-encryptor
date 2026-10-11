@echo off
setlocal
cd /d "%~dp0"
set "BUILD_PS_ARGS="
set "BUILD_SILENT=0"
if "%SILENT%"=="1" set "BUILD_SILENT=1"
:parse
if "%~1"=="" goto build
if /i "%~1"=="/s" goto silent
if /i "%~1"=="--silent" goto silent
if /i "%~1"=="/browser-host-only" goto browserhost
echo Unsupported build argument.
exit /b 2
:silent
set "BUILD_SILENT=1"
shift
goto parse
:browserhost
set "BUILD_PS_ARGS=-BrowserHostOnly"
shift
goto parse
:build
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build.ps1" %BUILD_PS_ARGS%
set "BUILD_RESULT=%ERRORLEVEL%"
if "%BUILD_SILENT%"=="1" goto done
pause
:done
exit /b %BUILD_RESULT%
