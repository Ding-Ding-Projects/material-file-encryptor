param([switch]$Installer)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
. "$PSScriptRoot\bootstrap.ps1"
function Invoke-Checked([scriptblock]$command) { & $command; if ($LASTEXITCODE -ne 0) { throw "Build command failed with exit code $LASTEXITCODE" } }
Invoke-Checked { npm.cmd ci }
Invoke-Checked { dotnet publish native/MaterialFileEncryptor.Host -c Release -r win-x64 --self-contained true -o out/native }
New-Item -ItemType Directory -Force out/native/notices | Out-Null
Copy-Item native/vendor/WinFsp/License.txt out/native/notices/WinFsp-License.txt
Copy-Item native/vendor/WinFsp/ORIGIN.md out/native/notices/WinFsp-Origin.md
Copy-Item LICENSE out/native/notices/MaterialFileEncryptor-License.txt
Invoke-Checked { npm.cmd run package -- --platform=win32 --arch=x64 }
if ($Installer) { Invoke-Checked { npm.cmd run make -- --platform=win32 --arch=x64 --from-package } }
