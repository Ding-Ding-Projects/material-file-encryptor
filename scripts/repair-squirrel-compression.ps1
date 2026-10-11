param([Parameter(Mandatory)][string]$ArtifactDirectory, [Parameter(Mandatory)][string]$VendorDirectory)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/squirrel-file-hash.ps1"
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$output = [IO.Path]::GetFullPath($ArtifactDirectory)
$quarantine = Join-Path $output 'reassembly-unsettled.json'
if (Test-Path -LiteralPath $quarantine) { throw 'SQUIRREL_PREVIOUS_PRODUCER_UNSETTLED' }
$packages = @(Get-ChildItem -LiteralPath $output -Filter '*.nupkg' -File)
if ($packages.Count -ne 1 -or !$packages[0].Name.EndsWith('-full.nupkg')) { throw 'EXPECTED_ONE_FULL_PACKAGE_FOR_RECOMPRESSION' }
$stage = Join-Path (Split-Path $output -Parent) ('recompression-' + [Guid]::NewGuid().ToString('N'))
$original = Join-Path $stage 'original'
New-Item -ItemType Directory -Force $original | Out-Null
foreach ($file in Get-ChildItem -LiteralPath $output -File) { Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $original $file.Name) }
. "$PSScriptRoot/squirrel-zip.ps1"
$corrected = Join-Path $stage $packages[0].Name
ConvertTo-SquirrelZip $packages[0].FullName $corrected
$sha1 = (Get-SquirrelFileHash -LiteralPath $corrected -Algorithm SHA1).Hash.ToLowerInvariant()
$bytes = (Get-Item -LiteralPath $corrected).Length
[IO.File]::WriteAllText((Join-Path $output 'RELEASES'), "$sha1 $($packages[0].Name) $bytes`n", [Text.UTF8Encoding]::new($false))
# Releasify accepts existing full packages without rewriting them, and assembles
# Setup from the indexed full package through the genuine Squirrel bootstrapper.
$squirrel = Join-Path $VendorDirectory 'Squirrel.exe'
$arguments = '--releasify "' + $corrected + '" --releaseDir "' + $output + '" --no-msi --no-delta'
$process = Start-Process -FilePath $squirrel -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $stage 'releasify.log') -RedirectStandardError (Join-Path $stage 'releasify-error.log')
try {
 $null = $process.Handle
 if (!$process.WaitForExit(600000)) {
  @{pid=$process.Id; startedAtUtc=$process.StartTime.ToUniversalTime().ToString('o'); stage=$stage; descendantsSettled=$false} | ConvertTo-Json | Set-Content -LiteralPath $quarantine -Encoding UTF8
  # Output stays quarantined until both this process and any helpers are settled.
  if (!$process.HasExited) { $process.Kill() }
  if (!$process.WaitForExit(30000)) { throw 'SQUIRREL_REASSEMBLY_TIMEOUT_PROCESS_UNSETTLED' }
  throw 'SQUIRREL_REASSEMBLY_TIMEOUT'
 }
 $process.Refresh()
 if ($process.ExitCode -ne 0) { throw 'SQUIRREL_REASSEMBLY_FAILED' }
} finally { $process.Dispose() }
$setup = Join-Path $output 'Setup.exe'
if (!(Test-Path -LiteralPath $setup)) { throw 'SQUIRREL_SETUP_MISSING' }
& "$PSScriptRoot/squirrel-setup-check.ps1" -Setup $setup -Package $corrected -Updater $squirrel -ReceiptPath (Join-Path $stage 'setup-inspection.json')
Move-Item -LiteralPath $setup -Destination (Join-Path $output 'MaterialFileEncryptor-Setup.exe') -Force
Write-Host 'Reassembled genuine Squirrel Setup from the explicitly Deflated full package; original outputs retained.'
