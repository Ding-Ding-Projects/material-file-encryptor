param([ValidateSet('Snapshot', 'Verify')][string]$Mode = 'Verify', [switch]$Local, [string]$ExpectedCommit)
# Explicit local mode uses the current user's real destination with strict fresh-install preflight.
# Setup --silent suppresses first-run launch; Update --uninstall is the real Squirrel
# lifecycle operation (electron-winstaller / Squirrel.Windows StartupOption).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$evidence = Join-Path $root 'out\evidence'
New-Item -ItemType Directory -Force $evidence | Out-Null
$snapshotFile = Join-Path $evidence 'tested-package-manifest.json'
$receiptFile = Join-Path $evidence 'installer-check.json'
$phase = 'preflight'
$sourceCommit = if ($Local) { (& git rev-parse HEAD).Trim() } else { $env:GITHUB_SHA }
$runId = if ($Local) { 'local-' + [Guid]::NewGuid().ToString('N') } else { $env:GITHUB_RUN_ID }
$runAttempt = if ($Local) { '1' } else { $env:GITHUB_RUN_ATTEMPT }
$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('mfe-installer-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$receipt = [ordered]@{ schemaVersion = 1; sourceCommit = $sourceCommit; runId = $runId; runAttempt = $runAttempt; route = 'disposable-windows-ci-playwright-electron'; passed = $false; phase = $phase; unsignedInstaller = $true; updaterBehaviorVerified = $false; artifactHashes = @{}; payload = @{}; install = @{}; installedApplication = @{}; uninstall = @{}; failure = $null }
$zip = $null
$temporaryDriver = $null
$ownedInstall = $false
$safeToUninstall = $false
$installRoot = $null
$updateExecutable = $null
$updateHash = $null
. "$PSScriptRoot\squirrel-uninstall-residue.ps1"

function Assert-Check([bool]$condition, [string]$code) { if (!$condition) { throw [InvalidOperationException]::new($code) } }
function File-Digest([string]$filename, [string]$algorithm = 'SHA256') { return (Get-FileHash -LiteralPath $filename -Algorithm $algorithm).Hash.ToLowerInvariant() }
function Stream-Digest($entry) {
    $stream = $entry.Open()
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose(); $stream.Dispose() }
}
function Payload-Selected([string]$name) {
    return $name -eq 'MaterialFileEncryptor.exe' -or $name -eq 'resources/app.asar' -or $name -eq 'resources/dependencies.json' -or $name.StartsWith('resources/native/') -or $name.StartsWith('resources/driver/') -or $name.StartsWith('resources/tools/')
}
function Wait-Check([scriptblock]$condition, [int]$seconds, [string]$code) {
    $deadline = [DateTime]::UtcNow.AddSeconds($seconds)
    do { if (& $condition) { return }; Start-Sleep -Milliseconds 300 } while ([DateTime]::UtcNow -lt $deadline)
    throw [InvalidOperationException]::new($code)
}
function Run-Bounded([string]$executable, [string[]]$arguments, [int]$seconds) {
    if ($Local) {
        $processReceipt = Join-Path $evidence ('installer-process-' + [Guid]::NewGuid().ToString('N') + '.json')
        $request = @{ executable = $executable; arguments = $arguments; seconds = $seconds; receipt = $processReceipt } | ConvertTo-Json -Compress
        $request | & python "$PSScriptRoot\local-installer-process.py"
        Assert-Check ($LASTEXITCODE -eq 0) 'HEADLESS_INSTALLER_PROCESS_FAILED'
        $result = Get-Content -LiteralPath $processReceipt -Raw | ConvertFrom-Json
        Assert-Check ($result.passed -eq $true -and $result.desktopClosed -eq $true -and $result.recordedProcessesAbsent -eq $true) 'HEADLESS_INSTALLER_PROCESS_UNVERIFIED'
        return $result.exitCode
    }
    $process = Start-Process -FilePath $executable -ArgumentList $arguments -WindowStyle Hidden -PassThru
    $null = $process.Handle # Retain the handle so Windows PowerShell can read ExitCode after exit.
    # A timeout fails without terminating the installer, application, or a mounted drive.
    if (!$process.WaitForExit($seconds * 1000)) { throw [TimeoutException]::new('PROCESS_TIMEOUT') }
    $process.Refresh()
    return $process.ExitCode
}
function Owned-Processes {
    return @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installRoot + '\', [StringComparison]::OrdinalIgnoreCase) })
}
function Owned-StartupEntries {
    $key = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
    if (!$key) { return @() }
    return @($key.PSObject.Properties | Where-Object { $_.Value -is [string] -and $_.Value.IndexOf($installRoot + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0 })
}
function Owned-UninstallEntries([switch]$Diagnostic) {
    $rows = @()
    foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)) {
        $hive = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
        try {
            $parent = $hive.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall')
            if (!$parent) { continue }
            try {
                foreach ($name in $parent.GetSubKeyNames()) {
                    $key = $parent.OpenSubKey($name)
                    if (!$key) { continue }
                    try {
                        $location = [string]$key.GetValue('InstallLocation', '')
                        $command = [string]$key.GetValue('UninstallString', '')
                        if (($Diagnostic -and $name -eq 'MaterialFileEncryptor') -or ($location.TrimEnd('\') -eq $installRoot) -or ($command.IndexOf($installRoot + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
                            $rows += @{ registryView=$view.ToString(); keyName=$name; installLocationMatches=($location.TrimEnd('\') -eq $installRoot); updaterCommandMatches=($command.IndexOf($installRoot + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0); displayVersion=[string]$key.GetValue('DisplayVersion', '') }
                        }
                    } finally { $key.Dispose() }
                }
            } finally { $parent.Dispose() }
        } finally { $hive.Dispose() }
    }
    return $rows
}
function Uninstall-Owned {
    Assert-Check ($ownedInstall -and $safeToUninstall) 'UNINSTALL_NOT_SAFE'
    Assert-Check ((Owned-Processes).Count -eq 0) 'INSTALLED_PROCESS_STILL_RUNNING'
    Assert-Check ((File-Digest $updateExecutable) -eq $updateHash) 'UPDATER_DIGEST_MISMATCH'
    $receipt.uninstall.attempted = $true
    $receipt.uninstall.exitCode = Run-Bounded $updateExecutable @('--uninstall', '--silent') 180
    Assert-Check ($receipt.uninstall.exitCode -eq 0) 'UNINSTALL_EXIT_CODE'
    Wait-Check { (Owned-Processes).Count -eq 0 } 45 'UNINSTALL_PROCESS_REMAINS'
    $residue = Get-SquirrelUninstallResidue -Root $installRoot -ExpectedVersion $sourcePackage.version -UpdaterSha256 $updateHash
    $receipt.uninstall.applicationDirectoriesRemoved = $residue.applicationDirectoriesRemoved
    $receipt.uninstall.applicationPayloadRemoved = $residue.applicationPayloadRemoved
    $receipt.uninstall.residueClassification = $residue.classification
    $receipt.uninstall.residueFailureCode = $residue.failureCode
    $receipt.uninstall.remainingRootEntries = $residue.residue
    $receipt.uninstall.registrationRemoved = (Owned-UninstallEntries).Count -eq 0
    $receipt.uninstall.startupRemoved = (Owned-StartupEntries).Count -eq 0
    $receipt.uninstall.noInstalledProcesses = (Owned-Processes).Count -eq 0
    Assert-Check $receipt.uninstall.noInstalledProcesses 'UNINSTALL_PROCESS_REMAINS'
    Assert-Check $receipt.uninstall.applicationPayloadRemoved $(if ($residue.failureCode) { $residue.failureCode } else { 'UNINSTALL_APPLICATION_REMAINS' })
    Assert-Check $receipt.uninstall.registrationRemoved 'UNINSTALL_REGISTRATION_REMAINS'
    Assert-Check $receipt.uninstall.startupRemoved 'UNINSTALL_STARTUP_REMAINS'
    # Squirrel intentionally leaves a .dead marker; do not manually delete its root.
}

try {
    Assert-Check ($env:OS -eq 'Windows_NT') 'WINDOWS_REQUIRED'
    Assert-Check ($Local -or ($env:GITHUB_ACTIONS -eq 'true' -and $env:RUNNER_OS -eq 'Windows')) 'EXPLICIT_LOCAL_OR_DISPOSABLE_CI_REQUIRED'
    if ($Local) {
        Assert-Check ($ExpectedCommit -match '^[0-9a-f]{40}$' -and $ExpectedCommit -eq $sourceCommit) 'LOCAL_SOURCE_COMMIT_REQUIRED'
        Assert-Check (@(& git status --porcelain).Count -eq 0) 'LOCAL_SOURCE_NOT_CLEAN'
        $receipt.route = 'explicit-current-user-local-hidden-desktop'
    }
    $desktop = Get-Content -LiteralPath (Join-Path $evidence 'desktop-check.json') -Raw | ConvertFrom-Json
    Assert-Check ($desktop.passed -eq $true -and $desktop.packagedArtifact.launchedBuiltArtifact -eq $true -and $desktop.platform -eq 'win32') 'PACKAGED_DESKTOP_PASS_REQUIRED'
    $packageRoot = Join-Path $root 'out\material-file-encryptor-win32-x64'
    if ($Local) {
        Assert-Check ($desktop.route -eq 'cheap-lowlevel-headless' -and $desktop.sourceCommit -eq $sourceCommit) 'LOCAL_DESKTOP_SOURCE_OR_ROUTE_MISMATCH'
        Assert-Check ($desktop.executableSha256 -eq (File-Digest (Join-Path $packageRoot 'MaterialFileEncryptor.exe')) -and $desktop.resourceHashes.asar -eq (File-Digest (Join-Path $packageRoot 'resources\app.asar'))) 'LOCAL_DESKTOP_ARTIFACT_MISMATCH'
    }
    if ($Mode -eq 'Snapshot') {
        $files = @(Get-ChildItem -LiteralPath $packageRoot -File -Recurse | ForEach-Object {
            $relative = $_.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
            if (Payload-Selected $relative) { [ordered]@{ entry = $relative; bytes = $_.Length; sha256 = File-Digest $_.FullName } }
        } | Sort-Object { $_.entry })
        Assert-Check ($files.Count -gt 5) 'PACKAGE_PAYLOAD_MISSING'
        [ordered]@{ schemaVersion = 1; commit = $sourceCommit; runId = $runId; runAttempt = $runAttempt; comparisonScope = @('application executable', 'ASAR', 'all native helper files and notices', 'all bundled driver files', 'all bundled portable transport tools and notices', 'dependency manifest'); packagedDesktopPassed = $true; desktopReceiptSha256 = File-Digest (Join-Path $evidence 'desktop-check.json'); files = $files } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $snapshotFile -Encoding UTF8
        Write-Host "Snapshotted $($files.Count) tested package payload entries."
        exit 0
    }

    $phase = 'artifact-integrity'
    $manifest = Get-Content -LiteralPath $snapshotFile -Raw | ConvertFrom-Json
    Assert-Check ($manifest.commit -eq $sourceCommit -and ($Local -or ($manifest.runId -eq $runId -and $manifest.runAttempt -eq $runAttempt))) 'SNAPSHOT_RUN_MISMATCH'
    Assert-Check ($manifest.packagedDesktopPassed -eq $true -and $manifest.desktopReceiptSha256 -eq (File-Digest (Join-Path $evidence 'desktop-check.json'))) 'DESKTOP_RECEIPT_CHANGED'
    $artifacts = Join-Path $root 'out\make\squirrel.windows\x64'
    $setup = Join-Path $artifacts 'MaterialFileEncryptor-Setup.exe'
    $releases = Join-Path $artifacts 'RELEASES'
    $setupFiles = @(Get-ChildItem -LiteralPath $artifacts -Filter '*.exe' -File)
    Assert-Check ($setupFiles.Count -eq 1 -and $setupFiles[0].Name -eq 'MaterialFileEncryptor-Setup.exe') 'EXPECTED_ONE_INTENDED_SETUP'
    $packages = @(Get-ChildItem -LiteralPath $artifacts -Filter '*-full.nupkg' -File)
    Assert-Check ($packages.Count -eq 1) 'EXPECTED_ONE_FULL_PACKAGE'
    $package = $packages[0]
    $releaseLines = @(Get-Content -LiteralPath $releases | Where-Object { $_.Trim() })
    $releaseNames = @{}
    foreach ($line in $releaseLines) {
        Assert-Check ($line -match '^([0-9a-fA-F]{40})\s+([A-Za-z0-9_.-]+\.nupkg)\s+(\d+)$') 'MALFORMED_RELEASE_ENTRY'
        $expectedHash = $Matches[1].ToLowerInvariant(); $name = $Matches[2]; $expectedBytes = [long]$Matches[3]
        Assert-Check (!$releaseNames.ContainsKey($name) -and !$name.Contains('..')) 'INVALID_RELEASE_PACKAGE_NAME'
        $releaseNames[$name] = $true
        $indexed = Join-Path $artifacts $name
        Assert-Check ((Test-Path -LiteralPath $indexed) -and (Get-Item -LiteralPath $indexed).Length -eq $expectedBytes -and (File-Digest $indexed 'SHA1') -eq $expectedHash) 'RELEASE_DIGEST_OR_SIZE_MISMATCH'
    }
    $allPackages = @(Get-ChildItem -LiteralPath $artifacts -Filter '*.nupkg' -File)
    Assert-Check ($releaseNames.Count -eq $allPackages.Count -and $releaseNames.ContainsKey($package.Name)) 'UNINDEXED_RELEASE_PACKAGE'
    foreach ($candidate in $allPackages) { Assert-Check ($releaseNames.ContainsKey($candidate.Name)) 'UNINDEXED_RELEASE_PACKAGE' }
    $phase = 'full-archive-integrity'
    & "$PSScriptRoot\package-integrity.ps1" -Packages @($allPackages | ForEach-Object FullName)
    Assert-Check ((Get-AuthenticodeSignature -LiteralPath $setup).Status -eq 'NotSigned') 'EXPECTED_UNSIGNED_SETUP'
    $receipt.artifactHashes = @{ setupSha256 = File-Digest $setup; nupkgSha256 = File-Digest $package.FullName; releasesSha256 = File-Digest $releases; testedManifestSha256 = File-Digest $snapshotFile; releasesDigestAndSizeVerified = $true; fullPackages = $packages.Count; deltaPackages = @($allPackages | Where-Object { $_.Name.EndsWith('-delta.nupkg') }).Count }

    $phase = 'tested-payload-comparison'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($package.FullName)
    $nuspecEntries = @($zip.Entries | Where-Object { $_.FullName -match '^[^/\\]+\.nuspec$' })
    Assert-Check ($nuspecEntries.Count -eq 1) 'EXPECTED_ONE_PACKAGE_MANIFEST'
    $reader = [IO.StreamReader]::new($nuspecEntries[0].Open())
    try { [xml]$nuspec = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $sourcePackage = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
    Assert-Check ($nuspec.package.metadata.id -eq 'MaterialFileEncryptor' -and $nuspec.package.metadata.version -eq $sourcePackage.version) 'PACKAGE_ID_OR_VERSION_MISMATCH'
    $receipt.package = @{ id = 'MaterialFileEncryptor'; version = $sourcePackage.version; architecture = 'x64' }
    $entries = @{}
    foreach ($entry in $zip.Entries) {
        $name = [Uri]::UnescapeDataString($entry.FullName).Replace('\', '/')
        Assert-Check (!$name.StartsWith('/') -and $name -notmatch '(^|/)\.\.(/|$)' -and !$name.Contains(':')) 'INVALID_PACKAGE_ENTRY_PATH'
        if ($name.StartsWith('lib/net45/') -and !$name.EndsWith('/')) {
            $relative = $name.Substring('lib/net45/'.Length)
            Assert-Check (!$entries.ContainsKey($relative)) 'DUPLICATE_PACKAGE_ENTRY'
            $entries[$relative] = $entry
        }
    }
    $selectedEntries = @($entries.Keys | Where-Object { Payload-Selected $_ })
    Assert-Check ($selectedEntries.Count -eq @($manifest.files).Count) 'PAYLOAD_ENTRY_COUNT_MISMATCH'
    foreach ($file in $manifest.files) {
        Assert-Check ($entries.ContainsKey($file.entry)) 'TESTED_PAYLOAD_ENTRY_MISSING'
        $entry = $entries[$file.entry]
        Assert-Check ($entry.Length -eq $file.bytes -and (Stream-Digest $entry) -eq $file.sha256) 'TESTED_PAYLOAD_DIGEST_MISMATCH'
    }
    $dependencies = Get-Content -LiteralPath (Join-Path $root 'dependencies.json') -Raw | ConvertFrom-Json
    $required = @('resources/tools/git/cmd/git.exe', 'resources/tools/gh/bin/gh.exe', 'MaterialFileEncryptor.exe', 'resources/app.asar', 'resources/dependencies.json', 'resources/native/MaterialFileEncryptor.Host.exe', 'resources/native/notices/WinFsp-License.txt', 'resources/native/notices/WinFsp-Origin.md', 'resources/native/notices/MaterialFileEncryptor-License.txt', "resources/driver/winfsp-$($dependencies.winfsp.version).msi")
    foreach ($name in $required) { Assert-Check ($entries.ContainsKey($name) -and $entries[$name].Length -gt 0) 'REQUIRED_RESOURCE_MISSING' }
    Assert-Check ((Stream-Digest $entries['resources/dependencies.json']) -eq (File-Digest (Join-Path $root 'dependencies.json'))) 'DEPENDENCY_MANIFEST_MISMATCH'
    $exeReader = [IO.BinaryReader]::new($entries['MaterialFileEncryptor.exe'].Open())
    try {
        $dosHeader = $exeReader.ReadBytes(64)
        Assert-Check ($dosHeader.Length -eq 64 -and [BitConverter]::ToUInt16($dosHeader, 0) -eq 0x5a4d) 'INVALID_EXECUTABLE_HEADER'
        $peOffset = [BitConverter]::ToInt32($dosHeader, 60)
        Assert-Check ($peOffset -ge 64 -and $peOffset -lt 16777216) 'INVALID_EXECUTABLE_HEADER'
        $null = $exeReader.ReadBytes($peOffset - 64)
        $peHeader = $exeReader.ReadBytes(6)
        Assert-Check ($peHeader.Length -eq 6 -and [BitConverter]::ToUInt32($peHeader, 0) -eq 0x4550 -and [BitConverter]::ToUInt16($peHeader, 4) -eq 0x8664) 'EXPECTED_X64_EXECUTABLE'
    } finally { $exeReader.Dispose() }
    $driverEntry = $entries["resources/driver/winfsp-$($dependencies.winfsp.version).msi"]
    Assert-Check ((Stream-Digest $driverEntry) -eq $dependencies.winfsp.sha256) 'DRIVER_PIN_MISMATCH'
    $temporaryDriver = Join-Path $fixtureRoot ('mfe-driver-proof-' + [Guid]::NewGuid().ToString('N') + '.msi')
    [IO.Compression.ZipFileExtensions]::ExtractToFile($driverEntry, $temporaryDriver, $false)
    $driverSignature = Get-AuthenticodeSignature -LiteralPath $temporaryDriver
    Assert-Check ($driverSignature.Status -eq 'Valid' -and $driverSignature.SignerCertificate.Subject -match [regex]::Escape($dependencies.winfsp.publisher)) 'DRIVER_SIGNATURE_NOT_TRUSTED'
    Assert-Check ($entries.ContainsKey('squirrel.exe')) 'PACKAGED_UPDATER_MISSING'
    $updateHash = Stream-Digest $entries['squirrel.exe']
    $receipt.payload = @{ comparisonScope = $manifest.comparisonScope; testedEntries = @($manifest.files).Count; nupkgEntriesMatched = $selectedEntries.Count; nativeEntries = @($manifest.files | Where-Object { $_.entry.StartsWith('resources/native/') }).Count; requiredResourcesPresent = $true; trustedDriverDigestAndSignature = $true }
    $zip.Dispose(); $zip = $null
    $receipt.payload.allArchiveEntriesIntegrityVerified = $true

    $phase = 'install-preflight'
    $installRoot = Join-Path $env:LOCALAPPDATA 'MaterialFileEncryptor'
    Assert-Check (!(Test-Path -LiteralPath $installRoot)) 'PREEXISTING_INSTALL_ROOT_REFUSED'
    Assert-Check ((Owned-UninstallEntries -Diagnostic).Count -eq 0 -and (Owned-StartupEntries).Count -eq 0) 'PREEXISTING_REGISTRATION_REFUSED'
    Assert-Check (@(Get-Process -Name MaterialFileEncryptor -ErrorAction SilentlyContinue).Count -eq 0) 'PREEXISTING_APPLICATION_REFUSED'
    $receipt.install.freshPerUserRoot = $true
    $ownedInstall = $true
    $phase = 'silent-install'
    $receipt.install.exitCode = Run-Bounded $setup @('--silent') 240
    Assert-Check ($receipt.install.exitCode -eq 0) 'INSTALL_EXIT_CODE'
    $updateExecutable = Join-Path $installRoot 'Update.exe'
    Wait-Check { Test-Path -LiteralPath $updateExecutable } 30 'INSTALLED_UPDATER_MISSING'
    Assert-Check ((File-Digest $updateExecutable) -eq $updateHash) 'INSTALLED_UPDATER_MISMATCH'
    $appDirectories = @(Get-ChildItem -LiteralPath $installRoot -Directory -Filter 'app-*')
    Assert-Check ($appDirectories.Count -eq 1) 'EXPECTED_ONE_INSTALLED_VERSION'
    $installedRoot = $appDirectories[0].FullName
    Assert-Check ($appDirectories[0].Name -eq "app-$($sourcePackage.version)") 'INSTALLED_VERSION_MISMATCH'
    $phase = 'installed-payload-comparison'
    foreach ($file in $manifest.files) {
        $installed = Join-Path $installedRoot $file.entry.Replace('/', '\')
        Assert-Check ((Test-Path -LiteralPath $installed) -and (File-Digest $installed) -eq $file.sha256) 'INSTALLED_PAYLOAD_MISMATCH'
    }
    $receipt.install.installedPayloadEntriesMatched = @($manifest.files).Count
    $receipt.install.installedExecutableSha256 = File-Digest (Join-Path $installedRoot 'MaterialFileEncryptor.exe')
    $receipt.install.installedExecutableSignature = (Get-AuthenticodeSignature -LiteralPath (Join-Path $installedRoot 'MaterialFileEncryptor.exe')).Status.ToString()
    Assert-Check ($receipt.install.installedExecutableSignature -eq 'NotSigned') 'EXPECTED_UNSIGNED_APPLICATION'
    $phase = 'install-registration'
    try { Wait-Check { (Owned-UninstallEntries).Count -gt 0 } 30 'INSTALL_REGISTRATION_MISSING' }
    finally { $receipt.install.registryDiagnostics = @{ process64Bit=[Environment]::Is64BitProcess; os64Bit=[Environment]::Is64BitOperatingSystem; entries=@(Owned-UninstallEntries -Diagnostic) } }
    $receipt.install.uninstallRegistrationPresent = (Owned-UninstallEntries).Count -gt 0
    Assert-Check $receipt.install.uninstallRegistrationPresent 'INSTALL_REGISTRATION_MISSING'
    Wait-Check { (Owned-Processes).Count -eq 0 } 30 'SILENT_INSTALL_LEFT_RUNNING_APP'
    $safeToUninstall = $true

    $phase = 'installed-application'
    $oldExecutable = $env:MFE_DESKTOP_EXECUTABLE
    $oldEvidence = $env:MFE_DESKTOP_EVIDENCE_DIR
    try {
        $env:MFE_DESKTOP_EXECUTABLE = Join-Path $installedRoot 'MaterialFileEncryptor.exe'
        $env:MFE_DESKTOP_EVIDENCE_DIR = Join-Path $evidence 'installed'
        $safeToUninstall = $false
        if ($Local) { & node.exe scripts/local-headless-desktop-check.mjs }
        else { & node.exe scripts/desktop-check.mjs }
        $desktopExit = $LASTEXITCODE
        $installedReceipt = Get-Content -LiteralPath (Join-Path $env:MFE_DESKTOP_EVIDENCE_DIR 'desktop-check.json') -Raw | ConvertFrom-Json
        if ($Local) {
            Assert-Check ($installedReceipt.route -eq 'cheap-lowlevel-headless' -and $installedReceipt.sourceCommit -eq $sourceCommit -and $installedReceipt.executableSha256 -eq $receipt.install.installedExecutableSha256) 'INSTALLED_LOCAL_SOURCE_OR_ARTIFACT_MISMATCH'
        }
        $safeToUninstall = !$installedReceipt.fixtureRetained -and @($installedReceipt.cleanupErrors).Count -eq 0
        $receipt.installedApplication = @{ harnessExitCode = $desktopExit; passed = $installedReceipt.passed; mountedFilesystemChecked = $installedReceipt.mountedFilesystemChecked; startupRegistration = $installedReceipt.startupRegistration; gracefulCleanup = $safeToUninstall }
        Assert-Check ($desktopExit -eq 0 -and $installedReceipt.passed -eq $true -and $installedReceipt.mountedFilesystemChecked -eq $true -and $safeToUninstall) 'INSTALLED_DESKTOP_CHECK_FAILED'
        Wait-Check { (Owned-Processes).Count -eq 0 } 30 'APPLICATION_DID_NOT_EXIT'
        $receipt.installedApplication.noProcessesAfterExit = $true
        $startupProof = $installedReceipt.startupRegistration
        Assert-Check ($startupProof.verificationOnly -eq $true -and $startupProof.initial -eq $false -and $startupProof.enabledReadback -eq $true -and $startupProof.disabledReadback -eq $false -and $startupProof.restored -eq $true) 'INSTALLED_STARTUP_TOGGLE_NOT_VERIFIED'
        Assert-Check ((Owned-StartupEntries).Count -eq 0) 'VERIFICATION_STARTUP_NOT_RESTORED'
    } finally {
        $env:MFE_DESKTOP_EXECUTABLE = $oldExecutable
        $env:MFE_DESKTOP_EVIDENCE_DIR = $oldEvidence
    }
    $phase = 'uninstall'
    Uninstall-Owned
    $receipt.passed = $true
    $phase = 'complete'
} catch {
    $code = $_.Exception.Message
    if ($code -notmatch '^[A-Z][A-Z0-9_]+$') { $code = 'UNEXPECTED_ERROR' }
    $receipt.failure = @{ phase = $phase; code = $code; hresult = $_.Exception.HResult }
    Write-Host "Installer check failed during $phase ($code)."
    if ($ownedInstall -and $safeToUninstall -and $updateExecutable -and (Test-Path -LiteralPath $updateExecutable) -and !$receipt.uninstall.attempted) {
        try { Uninstall-Owned } catch { $receipt.uninstall.cleanupFailed = $true }
    }
} finally {
    if ($zip) { $zip.Dispose() }
    if ($temporaryDriver -and (Test-Path -LiteralPath $temporaryDriver)) { Remove-Item -LiteralPath $temporaryDriver }
    if ((Test-Path -LiteralPath $fixtureRoot) -and @(Get-ChildItem -LiteralPath $fixtureRoot -Force).Count -eq 0) { Remove-Item -LiteralPath $fixtureRoot }
    if ($Mode -eq 'Verify') {
        $receipt.phase = $phase
        $receipt.installRetained = $ownedInstall -and !$receipt.uninstall.applicationPayloadRemoved
        $receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptFile -Encoding UTF8
    }
}
if (!$receipt.passed) { exit 1 }
Write-Host 'Genuine Squirrel install, installed desktop checks, normal exit, and uninstall passed.'
