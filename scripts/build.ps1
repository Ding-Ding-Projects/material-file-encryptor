param([switch]$Installer)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. "$PSScriptRoot\bootstrap.ps1"
function Invoke-Checked([scriptblock]$command) { & $command; if ($LASTEXITCODE -ne 0) { throw "Build command failed with exit code $LASTEXITCODE" } }
$toolStage = Join-Path $root ('out\tools.stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $toolStage | Out-Null
Copy-Item -LiteralPath $env:MFE_GIT_TOOL_ROOT -Destination (Join-Path $toolStage 'git') -Recurse
Copy-Item -LiteralPath $env:MFE_GH_TOOL_ROOT -Destination (Join-Path $toolStage 'gh') -Recurse
if (!(Test-PortableTree (Join-Path $tools "git-$($manifest.git.version).zip") (Join-Path $toolStage 'git')) -or !(Test-PortableTree (Join-Path $tools "gh-$($manifest.gh.version).zip") (Join-Path $toolStage 'gh'))) { throw 'Staged runtime tool bundle mismatch.' }
$toolOutput = Join-Path $root 'out\tools'
if (Test-Path -LiteralPath $toolOutput) { Move-Item -LiteralPath $toolOutput -Destination (Join-Path $tools ('bundle.previous-' + [Guid]::NewGuid().ToString('N'))) }
Move-Item -LiteralPath $toolStage -Destination $toolOutput
Invoke-Checked { npm.cmd ci }
Invoke-Checked { dotnet publish native/MaterialFileEncryptor.Host -c Release -r win-x64 --self-contained true -o out/native }
New-Item -ItemType Directory -Force out/native/notices | Out-Null
Copy-Item native/vendor/WinFsp/License.txt out/native/notices/WinFsp-License.txt
Copy-Item native/vendor/WinFsp/ORIGIN.md out/native/notices/WinFsp-Origin.md
Copy-Item LICENSE out/native/notices/MaterialFileEncryptor-License.txt
Invoke-Checked { npm.cmd run package -- --platform=win32 --arch=x64 }
if ($Installer) { Invoke-Checked { npm.cmd run make -- --platform=win32 --arch=x64 --from-package } }
