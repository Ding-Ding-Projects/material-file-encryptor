param(
  [Parameter(Mandatory=$true)][string]$VendorSource,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][string]$ModernExecutable,
  [Parameter(Mandatory=$true)][string]$License,
  [Parameter(Mandatory=$true)][string]$ExpectedSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedVersion,
  [Parameter(Mandatory=$true)][string]$ReceiptPath
)
$ErrorActionPreference = 'Stop'
function Get-ArchiveToolHash([string]$Path) {
  $stream = [IO.File]::OpenRead($Path)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
  finally { $stream.Dispose(); $hasher.Dispose() }
}
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Archive vendor destination already exists.' }
if (!(Test-Path -LiteralPath (Join-Path $VendorSource 'Squirrel.exe'))) { throw 'Squirrel vendor executable is missing.' }
if ((Get-ArchiveToolHash $ModernExecutable) -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Pinned archive executable hash mismatch.' }
Copy-Item -LiteralPath $VendorSource -Destination $OutputDirectory -Recurse
# Squirrel Utility.find7Zip resolves 7z.exe beside its own assembly. The
# architecture alias is also replaced so any installer selection preserves it.
$executables = @('7z.exe','7z-x64.exe')
$verified = @()
foreach ($name in $executables) {
  $target = Join-Path $OutputDirectory $name
  Copy-Item -LiteralPath $ModernExecutable -Destination $target -Force
  $digest = Get-ArchiveToolHash $target
  if ($digest -ne $ExpectedSha256.ToLowerInvariant()) { throw 'Copied archive executable hash mismatch.' }
  $versionOutput = (& $target i 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch ('7-Zip[^\r\n]*\b' + [regex]::Escape($ExpectedVersion) + '\b')) { throw 'Copied archive executable version mismatch.' }
  $verified += [ordered]@{file=$name;sha256=$digest;version=$ExpectedVersion}
}
Copy-Item -LiteralPath $License -Destination (Join-Path $OutputDirectory '7zip-License.txt')
$receipt = [ordered]@{
  schemaVersion=1; verifiedBeforePackaging=$true
  resolver='Squirrel.Utility.find7Zip -> FindHelperExecutable("7z.exe")'
  canonicalExecutable='7z.exe'; distribution='official standalone 7za'
  executables=$verified
}
New-Item -ItemType Directory -Force (Split-Path $ReceiptPath -Parent) | Out-Null
$receipt | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8
