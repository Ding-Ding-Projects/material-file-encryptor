param([Parameter(Mandatory)][string]$FailedReceipt, [Parameter(Mandatory)][string]$UninstallProcessReceipt, [Parameter(Mandatory)][string]$Package, [Parameter(Mandatory)][string]$ExpectedSource, [Parameter(Mandatory)][string]$ExpectedCheckerCommit, [Parameter(Mandatory)][string]$ReceiptPath)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\squirrel-uninstall-residue.ps1"
$checkerRoot = Split-Path $PSScriptRoot -Parent
$checkerCommit = (& git -C $checkerRoot rev-parse HEAD).Trim()
if ($ExpectedSource -notmatch '^[a-f0-9]{40}$' -or $ExpectedCheckerCommit -ne $checkerCommit -or @(& git -C $checkerRoot status --porcelain).Count -ne 0) { throw 'DIAGNOSTIC_SOURCE_REQUIRED' }
if (Test-Path -LiteralPath $ReceiptPath) { throw 'DIAGNOSTIC_RECEIPT_EXISTS' }
$originalReceiptHash = Get-SquirrelResidueDigest $FailedReceipt
$failed = Get-Content -LiteralPath $FailedReceipt -Raw | ConvertFrom-Json
$process = Get-Content -LiteralPath $UninstallProcessReceipt -Raw | ConvertFrom-Json
if ($failed.sourceCommit -ne $ExpectedSource -or $failed.passed -ne $false -or $failed.failure.code -ne 'UNINSTALL_PAYLOAD_REMAINS' -or $failed.uninstall.attempted -ne $true -or $failed.uninstall.exitCode -ne 0 -or $failed.installedApplication.passed -ne $true) { throw 'ORIGINAL_FAILED_UNINSTALL_REQUIRED' }
$installRoot = Join-Path $env:LOCALAPPDATA 'MaterialFileEncryptor'
if ($process.route -ne 'cheap-lowlevel-headless' -or $process.passed -ne $true -or $process.exitCode -ne 0 -or $process.recordedProcessesAbsent -ne $true -or $process.desktopClosed -ne $true -or $process.operation.process.executablePath -ine (Join-Path $installRoot 'Update.exe')) { throw 'ORIGINAL_UNINSTALL_PROCESS_REQUIRED' }
if ((Get-SquirrelResidueDigest $Package) -ne $failed.artifactHashes.nupkgSha256) { throw 'ORIGINAL_PACKAGE_DIGEST_MISMATCH' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Package)
try {
    $updater = @($zip.Entries | Where-Object { [Uri]::UnescapeDataString($_.FullName).Replace('\', '/') -ieq 'lib/net45/squirrel.exe' })
    if ($updater.Count -ne 1) { throw 'TRUSTED_PACKAGE_UPDATER_REQUIRED' }
    $stream = $updater[0].Open(); $hasher = [Security.Cryptography.SHA256]::Create()
    try { $updateHash = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose(); $stream.Dispose() }
} finally { $zip.Dispose() }
$classification = Get-SquirrelUninstallResidue -Root $installRoot -ExpectedVersion $failed.package.version -UpdaterSha256 $updateHash
$registration = @()
foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)) {
    $hive = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
        $parent = $hive.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Uninstall')
        if (!$parent) { continue }
        try {
            foreach ($name in $parent.GetSubKeyNames()) {
                $key = $parent.OpenSubKey($name)
                try {
                    $location = [string]$key.GetValue('InstallLocation', '')
                    $command = [string]$key.GetValue('UninstallString', '')
                    if ($name -eq 'MaterialFileEncryptor' -or $location.TrimEnd('\') -eq $installRoot -or $command.IndexOf($installRoot + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0) { $registration += @{ registryView = $view.ToString(); present = $true } }
                } finally { if ($key) { $key.Dispose() } }
            }
        } finally { $parent.Dispose() }
    } finally { $hive.Dispose() }
}
$startupCount = 0
foreach ($view in @([Microsoft.Win32.RegistryView]::Registry32, [Microsoft.Win32.RegistryView]::Registry64)) {
    $hive = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, $view)
    try {
        $key = $hive.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run')
        if (!$key) { continue }
        try {
            foreach ($name in $key.GetValueNames()) {
                $value = $key.GetValue($name)
                if ($value -is [string] -and $value.IndexOf($installRoot + '\', [StringComparison]::OrdinalIgnoreCase) -ge 0) { $startupCount++ }
            }
        } finally { $key.Dispose() }
    } finally { $hive.Dispose() }
}
$processCount = @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($installRoot + '\', [StringComparison]::OrdinalIgnoreCase) }).Count
if ((Get-SquirrelResidueDigest $FailedReceipt) -ne $originalReceiptHash) { throw 'ORIGINAL_FAILED_RECEIPT_CHANGED' }
$result = [ordered]@{ schemaVersion = 1; verificationScope = 'post-uninstall-read-only-reclassification'; sourceCommit = $ExpectedSource; checkerCommit = $checkerCommit; observedAtUtc = [DateTime]::UtcNow.ToString('o'); originalFailedReceiptSha256 = $originalReceiptHash; originalProcessReceiptSha256 = Get-SquirrelResidueDigest $UninstallProcessReceipt; packageSha256 = $failed.artifactHashes.nupkgSha256; trustedUpdaterSha256 = $updateHash; originalFailurePreserved = $true; lifecycleReexecuted = $false; classification = $classification; registrationRemoved = $registration.Count -eq 0; startupRemoved = $startupCount -eq 0; noInstalledProcesses = $processCount -eq 0; installRetained = !$classification.applicationPayloadRemoved; passed = $classification.applicationPayloadRemoved -and $registration.Count -eq 0 -and $startupCount -eq 0 -and $processCount -eq 0 }
$json = $result | ConvertTo-Json -Depth 8
$output = [IO.File]::Open($ReceiptPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
try { $bytes = [Text.Encoding]::UTF8.GetBytes($json); $output.Write($bytes, 0, $bytes.Length) } finally { $output.Dispose() }
Write-Host "Read-only uninstall residue diagnosis passed: $($result.passed). Original lifecycle receipt preserved."
if (!$result.passed) { exit 1 }
