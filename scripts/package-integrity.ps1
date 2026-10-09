param([string[]]$Packages, [string]$ReceiptPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
function Archive-Digest([string]$path) {
  $stream = [IO.File]::OpenRead($path); $hash = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $hash.Dispose(); $stream.Dispose() }
}
$dependencies = Get-Content -LiteralPath (Join-Path $root 'dependencies.json') -Raw | ConvertFrom-Json
$writer = Join-Path (Join-Path $env:LOCALAPPDATA "MaterialFileEncryptor-BuildTools\7zip-$($dependencies.sevenZip.version)") $dependencies.sevenZip.executable
if (!(Test-Path -LiteralPath $writer) -or (Archive-Digest $writer) -ne $dependencies.sevenZip.executableSha256) { throw 'PINNED_ARCHIVE_READER_REQUIRED' }
if (!$Packages) { $Packages = @(Get-ChildItem -LiteralPath (Join-Path $root 'out\make\squirrel.windows\x64') -Filter '*.nupkg' -File | ForEach-Object FullName) }
if (!$Packages -or $Packages.Count -eq 0) { throw 'PACKAGE_INTEGRITY_INPUT_REQUIRED' }
if (!$ReceiptPath) { $ReceiptPath = Join-Path $root 'out\evidence\package-integrity.json' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$rows = @()
$passed = $false
try {
  foreach ($package in $Packages) {
    $zip = [IO.Compression.ZipFile]::OpenRead($package)
    try { $entryCount = $zip.Entries.Count; if ($entryCount -eq 0) { throw 'EMPTY_PACKAGE_ARCHIVE' } }
    finally { $zip.Dispose() }
    # 7-Zip tests every entry's decompression and stored CRC, not just selected payload hashes.
    $previousPreference = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue' # Native stderr is diagnostic; the exit code is authoritative.
      $null = & $writer t -bd -bb0 -- $package 2>&1
      $exitCode = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    $rows += @{ name = [IO.Path]::GetFileName($package); sha256 = Archive-Digest $package; bytes = (Get-Item -LiteralPath $package).Length; entries = $entryCount; readerExitCode = $exitCode }
    if ($exitCode -ne 0) { throw 'PACKAGE_ARCHIVE_INTEGRITY_FAILED' }
  }
  $passed = $true
} finally {
  New-Item -ItemType Directory -Force (Split-Path $ReceiptPath -Parent) | Out-Null
  @{ schemaVersion = 1; sourceCommit = (& git -C $root rev-parse HEAD).Trim(); passed = $passed; readerVersion = $dependencies.sevenZip.version; readerSha256 = $dependencies.sevenZip.executableSha256; allEntriesTested = $true; packages = $rows } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
}
Write-Host "All archive entries passed decompression and CRC verification in $($rows.Count) package(s)."
