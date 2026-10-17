param([switch]$Installer, [switch]$BrowserHostOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if ($Installer -and (Test-Path -LiteralPath 'out/make/squirrel.windows/x64/reassembly-unsettled.json')) { throw 'SQUIRREL_PREVIOUS_PRODUCER_UNSETTLED' }
. "$PSScriptRoot\bootstrap.ps1"
function Invoke-Checked([scriptblock]$command) { & $command; if ($LASTEXITCODE -ne 0) { throw "Build command failed with exit code $LASTEXITCODE" } }
if (!(Test-Path Env:PRIVATE_INSTRUCTIONS_SOURCE)) {
  $instructionSource = & git config --local --get privateInstructions.source
  if ($LASTEXITCODE -eq 0 -and ![string]::IsNullOrWhiteSpace($instructionSource)) { $env:PRIVATE_INSTRUCTIONS_SOURCE = $instructionSource }
}
Invoke-Checked { node scripts/check-vocabulary.mjs }
Invoke-Checked { node scripts/desktop-icons.mjs check }
function Publish-BrowserHost {
  Invoke-Checked { dotnet publish native/MaterialFileEncryptor.BrowserHost -c Release -r win-x64 --self-contained true -o out/browser-host }
  Invoke-Checked { node scripts/write-browser-host-config.mjs out/browser-host }
  $browserHostReceipt = @{
    schemaVersion=1; sourceCommit=((& git rev-parse HEAD).Trim()); sourceTree=((& git rev-parse 'HEAD^{tree}').Trim())
    projectSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.BrowserHost/MaterialFileEncryptor.BrowserHost.csproj')
    hostSourceSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.BrowserHost/Program.cs')
    nativeChecksSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.BrowserHost/NativeChecks.cs')
    executableSha256=(Get-BootstrapDigest 'out/browser-host/MaterialFileEncryptor.BrowserHost.exe')
    assemblySha256=(Get-BootstrapDigest 'out/browser-host/MaterialFileEncryptor.BrowserHost.dll')
    runtimeConfigSha256=(Get-BootstrapDigest 'out/browser-host/MaterialFileEncryptor.BrowserHost.runtimeconfig.json')
    dependenciesSha256=(Get-BootstrapDigest 'out/browser-host/MaterialFileEncryptor.BrowserHost.deps.json')
    runtimeVerification='not-run'; installation='not-performed'; registryMutation='not-performed'
  }
  New-Item -ItemType Directory -Force out/evidence | Out-Null
  [IO.File]::WriteAllText((Join-Path $root 'out/evidence/browser-host-build.json'), ($browserHostReceipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
}
if ($BrowserHostOnly) {
  if ($Installer) { throw 'Browser host focus cannot produce an installer.' }
  Publish-BrowserHost
  return
}
if ($env:GITHUB_ACTIONS -eq 'true') {
  # Every producer in one run uses the same Squirrel and application version.
  Invoke-Checked { node scripts/release-version.mjs }
}
$toolStage = Join-Path $root ('out\tools.stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $toolStage | Out-Null
Copy-Item -LiteralPath $env:MFE_GIT_TOOL_ROOT -Destination (Join-Path $toolStage 'git') -Recurse
Copy-Item -LiteralPath $env:MFE_GH_TOOL_ROOT -Destination (Join-Path $toolStage 'gh') -Recurse
if (!(Test-PortableTree (Join-Path $tools "git-$($manifest.git.version).zip") (Join-Path $toolStage 'git')) -or !(Test-PortableTree (Join-Path $tools "gh-$($manifest.gh.version).zip") (Join-Path $toolStage 'gh'))) { throw 'Staged runtime tool bundle mismatch.' }
$toolOutput = Join-Path $root 'out\tools'
if (Test-Path -LiteralPath $toolOutput) { Move-Item -LiteralPath $toolOutput -Destination (Join-Path $tools ('bundle.previous-' + [Guid]::NewGuid().ToString('N'))) }
Move-Item -LiteralPath $toolStage -Destination $toolOutput
# Bind runtime executables to the verified pinned bundle copied above.
$forgeExecutables = @{ schemaVersion = 1 }
foreach ($name in @('git', 'gh')) {
  $relative = if ($name -eq 'git') { 'git/cmd/git.exe' } else { 'gh/bin/gh.exe' }
  $executable = Join-Path $toolOutput $relative
  if (!(Test-Path -LiteralPath $executable -PathType Leaf)) { throw "Verified runtime executable is missing: $name" }
  $forgeExecutables[$name] = @{ relativePath = $relative; version = $manifest.$name.version; sha256 = (Get-BootstrapDigest $executable).ToLowerInvariant() }
}
[IO.File]::WriteAllText((Join-Path $toolOutput 'forge-executables.json'), ($forgeExecutables | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Invoke-Checked { npm.cmd ci }
Invoke-Checked { node scripts/stage-font-outputs.mjs }
Invoke-Checked { node scripts/build-workspace.mjs }
Invoke-Checked { node scripts/build-site.mjs }
Invoke-Checked { dotnet publish native/MaterialFileEncryptor.Host -c Release -r win-x64 --self-contained true -o out/native }
Publish-BrowserHost
# Compile focused native verification before unrelated runtime provisioning.
Invoke-Checked { dotnet build native/MaterialFileEncryptor.Core.Tests -c Release }
# Compile verification tooling only; runtime acceptance runs independently.
Invoke-Checked { dotnet publish native/MaterialFileEncryptor.MountedLifecycle.Tests -c Release -r win-x64 --self-contained false -o out/verification/mounted-lifecycle }
Invoke-Checked { dotnet publish native/MaterialFileEncryptor.ServerLease.Verifier -c Release -r win-x64 --self-contained false -o out/verification/server-file-lease }
$leaseVerifierReceipt = @{ schemaVersion=1; sourceCommit=((& git rev-parse HEAD).Trim()); leaseSourceSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.Host/ServerFileLease.cs'); verifierSourceSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.ServerLease.Verifier/Program.cs'); verifierDllSha256=(Get-BootstrapDigest 'out/verification/server-file-lease/MaterialFileEncryptor.ServerLease.Verifier.dll'); runtimeVerification='not-run' }
[IO.File]::WriteAllText((Join-Path $root 'out/verification/server-file-lease/source-receipt.json'), ($leaseVerifierReceipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
Invoke-Checked { dotnet publish native/MaterialFileEncryptor.OllamaLifetime.Verifier -c Release -r win-x64 --self-contained false -o out/verification/ollama-lifetime }
$ollamaVerifierReceipt = @{ schemaVersion=1; sourceCommit=((& git rev-parse HEAD).Trim()); fileLeaseSourceSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.Host/ServerFileLease.cs'); runtimeLeaseSourceSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.Host/OllamaRuntimeLease.cs'); runtimeBrokerSourceSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.Host/OllamaRuntimeBroker.cs'); runtimeManifestSha256=(Get-BootstrapDigest 'src/main/ollama-runtime-files.json'); verifierProjectSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.OllamaLifetime.Verifier/MaterialFileEncryptor.OllamaLifetime.Verifier.csproj'); verifierSourceSha256=(Get-BootstrapDigest 'native/MaterialFileEncryptor.OllamaLifetime.Verifier/Program.cs'); verifierDllSha256=(Get-BootstrapDigest 'out/verification/ollama-lifetime/MaterialFileEncryptor.OllamaLifetime.Verifier.dll'); runtimeVerification='not-run' }
[IO.File]::WriteAllText((Join-Path $root 'out/verification/ollama-lifetime/source-receipt.json'), ($ollamaVerifierReceipt | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
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
  & "$PSScriptRoot\repair-squirrel-compression.ps1" -ArtifactDirectory 'out/make/squirrel.windows/x64' -VendorDirectory $vendorStage -BrandedUpdater 'out/material-file-encryptor-win32-x64/Squirrel.exe'
  & "$PSScriptRoot\package-integrity.ps1"
  foreach ($fullPackage in Get-ChildItem 'out/make/squirrel.windows/x64' -Filter '*-full.nupkg' -File) {
    & "$PSScriptRoot\squirrel-payload-check.ps1" -Package $fullPackage.FullName -Updater (Join-Path $vendorStage 'Squirrel.exe') -ExpectedVersion ((Get-Content package.json -Raw | ConvertFrom-Json).version) -ExpectedSource ((& git rev-parse HEAD).Trim()) -ReceiptPath 'out/evidence/squirrel-extraction.json'
  }
}
