param([switch]$Installer)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
. "$PSScriptRoot\bootstrap.ps1"
function Invoke-Checked([scriptblock]$command) { & $command; if ($LASTEXITCODE -ne 0) { throw "Build command failed with exit code $LASTEXITCODE" } }
if (!(Test-Path Env:PRIVATE_INSTRUCTIONS_SOURCE)) {
  $instructionSource = & git config --local --get privateInstructions.source
  if ($LASTEXITCODE -eq 0 -and ![string]::IsNullOrWhiteSpace($instructionSource)) { $env:PRIVATE_INSTRUCTIONS_SOURCE = $instructionSource }
}
Invoke-Checked { node scripts/check-vocabulary.mjs }
$toolStage = Join-Path $root ('out\tools.stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $toolStage | Out-Null
Copy-Item -LiteralPath $env:MFE_GIT_TOOL_ROOT -Destination (Join-Path $toolStage 'git') -Recurse
Copy-Item -LiteralPath $env:MFE_GH_TOOL_ROOT -Destination (Join-Path $toolStage 'gh') -Recurse
if (!(Test-PortableTree (Join-Path $tools "git-$($manifest.git.version).zip") (Join-Path $toolStage 'git')) -or !(Test-PortableTree (Join-Path $tools "gh-$($manifest.gh.version).zip") (Join-Path $toolStage 'gh'))) { throw 'Staged runtime tool bundle mismatch.' }
$toolOutput = Join-Path $root 'out\tools'
if (Test-Path -LiteralPath $toolOutput) { Move-Item -LiteralPath $toolOutput -Destination (Join-Path $tools ('bundle.previous-' + [Guid]::NewGuid().ToString('N'))) }
Move-Item -LiteralPath $toolStage -Destination $toolOutput
Invoke-Checked { npm.cmd ci }
Invoke-Checked { node scripts/build-workspace.mjs }
Invoke-Checked { node scripts/build-site.mjs }
Invoke-Checked { dotnet publish native/MaterialFileEncryptor.Host -c Release -r win-x64 --self-contained true -o out/native }
Invoke-Checked { dotnet publish src/features/converter/native/ConverterSandbox.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o out/converter }
Copy-Item -LiteralPath (Join-Path $node 'node.exe') -Destination 'out/converter/node.exe' -Force
if (Test-Path -LiteralPath (Join-Path $root 'out\converter\media')) { throw 'Obsolete media runtime present. Preserve it outside out/converter before packaging.' }
Invoke-Checked { node scripts/converter-minimal-component.mjs https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/download/ffmpeg-runtime-9.0.2.1/ffmpeg-9.0.2-minimal-v1-win64.zip out/converter/minimal-media }
Invoke-Checked { node scripts/converter-archive-runtime.mjs out/converter/archive | Out-Null }
Copy-Item -LiteralPath docs/features/converter/archive-runtime-manifest.json -Destination out/converter/archive-manifest.json -Force
$converterManifest = @{
  schemaVersion = 1
  launcherSha256 = (Get-BootstrapDigest 'out/converter/ConverterSandbox.exe').ToLowerInvariant()
  runtimeSha256 = (Get-BootstrapDigest 'out/converter/node.exe').ToLowerInvariant()
  launcherCompanionHashes = @{}
}
foreach ($companion in @('ConverterSandbox.dll', 'ConverterSandbox.runtimeconfig.json', 'ConverterSandbox.deps.json')) {
  $companionPath = Join-Path 'out/converter' $companion
  if (Test-Path -LiteralPath $companionPath) { $converterManifest.launcherCompanionHashes[$companion] = (Get-BootstrapDigest $companionPath).ToLowerInvariant() }
}
[IO.File]::WriteAllText((Join-Path $root 'out/converter/manifest.json'), ($converterManifest | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Invoke-Checked { dotnet build native/MaterialFileEncryptor.Core.Tests -c Release }
New-Item -ItemType Directory -Force out/native/notices | Out-Null
Copy-Item native/vendor/WinFsp/License.txt out/native/notices/WinFsp-License.txt
Copy-Item native/vendor/WinFsp/ORIGIN.md out/native/notices/WinFsp-Origin.md
Copy-Item LICENSE out/native/notices/MaterialFileEncryptor-License.txt
Invoke-Checked { npm.cmd run package -- --platform=win32 --arch=x64 }
Invoke-Checked { node scripts/package-privacy.mjs out/material-file-encryptor-win32-x64 }
if ($Installer) {
  # Keep Squirrel's supported vendor layout with pinned archive and NuGet tools.
  $vendorStage = Join-Path $root ('out\squirrel-vendor-' + [Guid]::NewGuid().ToString('N'))
  Copy-Item -LiteralPath (Join-Path $root 'node_modules\electron-winstaller\vendor') -Destination $vendorStage -Recurse
  Copy-Item -LiteralPath $env:MFE_ARCHIVE_EXECUTABLE -Destination (Join-Path $vendorStage '7z.exe') -Force
  if ((Get-BootstrapDigest (Join-Path $vendorStage '7z.exe')) -ne $manifest.sevenZip.executableSha256) { throw 'Staged archive writer mismatch.' }
  Copy-Item -LiteralPath $env:MFE_NUGET_EXECUTABLE -Destination (Join-Path $vendorStage 'nuget.exe') -Force
  if ((Get-BootstrapDigest (Join-Path $vendorStage 'nuget.exe')) -ne $manifest.nuget.sha256) { throw 'Staged NuGet mismatch.' }
  $env:MFE_SQUIRREL_VENDOR_DIRECTORY = $vendorStage
  try { Invoke-Checked { npm.cmd run make -- --platform=win32 --arch=x64 --from-package } }
  finally { Remove-Item Env:MFE_SQUIRREL_VENDOR_DIRECTORY -ErrorAction SilentlyContinue }
  & "$PSScriptRoot\package-integrity.ps1"
}
