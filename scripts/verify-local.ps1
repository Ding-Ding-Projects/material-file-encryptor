param([switch]$InstallDriver)
$ErrorActionPreference='Stop'
. "$PSScriptRoot/bootstrap.ps1" -InstallDriver:$InstallDriver
function Checked([scriptblock]$command) { & $command; if ($LASTEXITCODE -ne 0) { throw "Local verification failed: $LASTEXITCODE" } }
Checked { npm.cmd test }
Checked { dotnet run --project native/MaterialFileEncryptor.Core.Tests -c Release }
Checked { npx.cmd --no-install playwright install chromium ffmpeg }
Checked { & "$PSScriptRoot/windows-mounted-check.ps1" }
Checked { npm.cmd run test:desktop }
