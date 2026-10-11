param([Parameter(Mandatory)][string]$Setup, [Parameter(Mandatory)][string]$Package,
  [Parameter(Mandatory)][string]$Updater, [string]$Background, [string]$ReceiptPath)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/squirrel-file-hash.ps1"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$setupPath = [IO.Path]::GetFullPath($Setup)
$stream = [IO.File]::OpenRead($setupPath)
$reader = [IO.BinaryReader]::new($stream)
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('mfe-setup-inspection-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $scratch | Out-Null
$embeddedPath = Join-Path $scratch 'embedded.zip'
function Read-SetupBytes([long]$Offset, [int]$Count) {
  if ($Offset -lt 0 -or $Count -lt 0 -or $Offset + $Count -gt $stream.Length) { throw 'SETUP_PE_BOUNDS' }
  $stream.Position = $Offset
  $bytes = $reader.ReadBytes($Count)
  if ($bytes.Length -ne $Count) { throw 'SETUP_PE_TRUNCATED' }
  return ,$bytes
}
function Read-U16([long]$Offset) { [BitConverter]::ToUInt16((Read-SetupBytes $Offset 2),0) }
function Read-U32([long]$Offset) { [BitConverter]::ToUInt32((Read-SetupBytes $Offset 4),0) }
function Resolve-Rva([long]$Rva, [long]$Count) {
  foreach ($section in $sections) {
    if ($Rva -ge $section.rva -and $Rva + $Count -le $section.rva + $section.rawSize) {
      $offset = $section.rawOffset + ($Rva - $section.rva)
      if ($offset + $Count -le $stream.Length) { return $offset }
    }
  }
  throw 'SETUP_PE_RVA_OUTSIDE_FILE'
}
function Find-ResourceChild([long]$Relative, $Wanted, [bool]$Directory) {
  if ($Relative -lt 0 -or $Relative + 16 -gt $resourceSize) { throw 'SETUP_RESOURCE_BOUNDS' }
  $count = (Read-U16 ($resourceBase+$Relative+12)) + (Read-U16 ($resourceBase+$Relative+14))
  if ($count -gt 4096 -or $Relative + 16 + $count*8 -gt $resourceSize) { throw 'SETUP_RESOURCE_DIRECTORY_INVALID' }
  $found = @()
  for ($index=0; $index -lt $count; $index++) {
    $entry = $resourceBase+$Relative+16+$index*8
    [long]$name = Read-U32 $entry
    $key = $name
    if ($name -band 2147483648L) {
      $relativeName = $name -band 2147483647L
      if ($relativeName + 2 -gt $resourceSize) { throw 'SETUP_RESOURCE_NAME_BOUNDS' }
      $length = Read-U16 ($resourceBase+$relativeName)
      if ($relativeName+2+$length*2 -gt $resourceSize) { throw 'SETUP_RESOURCE_NAME_BOUNDS' }
      $key = [Text.Encoding]::Unicode.GetString((Read-SetupBytes ($resourceBase+$relativeName+2) ($length*2)))
    }
    if ($key -ceq $Wanted) {
      [long]$target = Read-U32 ($entry+4)
      if ([bool]($target -band 2147483648L) -ne $Directory) { throw 'SETUP_RESOURCE_KIND_INVALID' }
      $found += ($target -band 2147483647L)
    }
  }
  if ($found.Count -ne 1) { throw 'SETUP_PAYLOAD_RESOURCE_REQUIRED' }
  return $found[0]
}
try {
  if ((Read-U16 0) -ne 0x5a4d) { throw 'SETUP_DOS_HEADER_INVALID' }
  $pe = Read-U32 0x3c
  if ((Read-U32 $pe) -ne 0x4550) { throw 'SETUP_PE_HEADER_INVALID' }
  $sectionCount = Read-U16 ($pe+6); $optionalSize = Read-U16 ($pe+20)
  $optional = $pe+24; $magic = Read-U16 $optional
  $directory = if ($magic -eq 0x10b) { $optional+96 } elseif ($magic -eq 0x20b) { $optional+112 } else { throw 'SETUP_PE_FORMAT_UNSUPPORTED' }
  if ($sectionCount -eq 0 -or $sectionCount -gt 96 -or $directory+24 -gt $optional+$optionalSize) { throw 'SETUP_PE_LAYOUT_INVALID' }
  $resourceRva = Read-U32 ($directory+16); $resourceSize = Read-U32 ($directory+20)
  $sections = @()
  for ($index=0; $index -lt $sectionCount; $index++) {
    $entry = $optional+$optionalSize+$index*40
    $sections += @{ rva=[long](Read-U32 ($entry+12)); rawSize=[long](Read-U32 ($entry+16)); rawOffset=[long](Read-U32 ($entry+20)) }
  }
  $resourceBase = Resolve-Rva $resourceRva $resourceSize
  $type = Find-ResourceChild 0 'DATA' $true
  $name = Find-ResourceChild $type 131 $true
  $data = Find-ResourceChild $name 1033 $false
  if ($data+16 -gt $resourceSize) { throw 'SETUP_RESOURCE_DATA_BOUNDS' }
  $payloadRva = Read-U32 ($resourceBase+$data)
  $payloadSize = Read-U32 ($resourceBase+$data+4)
  if ($payloadSize -lt 22 -or $payloadSize -gt 1500000000) { throw 'SETUP_PAYLOAD_SIZE_INVALID' }
  $stream.Position = Resolve-Rva $payloadRva $payloadSize
  $output = [IO.File]::Create($embeddedPath)
  try {
    $buffer = New-Object byte[] 1048576
    [long]$remaining = $payloadSize
    while ($remaining -gt 0) {
      $read = $stream.Read($buffer,0,[int][Math]::Min($buffer.Length,$remaining))
      if ($read -eq 0) { throw 'SETUP_PAYLOAD_TRUNCATED' }
      $output.Write($buffer,0,$read); $remaining -= $read
    }
  } finally { $output.Dispose() }
} finally { $reader.Dispose(); $stream.Dispose() }
function Get-EntryDigest($Entry, [string]$Algorithm) {
  $inputStream = $Entry.Open(); $hasher = [Security.Cryptography.HashAlgorithm]::Create($Algorithm)
  try { return ([BitConverter]::ToString($hasher.ComputeHash($inputStream))).Replace('-','').ToLowerInvariant() }
  finally { $inputStream.Dispose(); $hasher.Dispose() }
}
$zip = [IO.Compression.ZipFile]::OpenRead($embeddedPath)
try {
  $packageName = [IO.Path]::GetFileName($Package)
  $expectedNames = @($packageName,'RELEASES','Update.exe')
  if ($Background) { $expectedNames += 'background.gif' }
  $entries = @{}
  foreach ($entry in $zip.Entries) {
    if ($entry.FullName -cnotin $expectedNames -or $entries.ContainsKey($entry.FullName)) { throw 'SETUP_UNEXPECTED_OR_DUPLICATE_ENTRY' }
    $entries[$entry.FullName] = $entry
  }
  if ($entries.Count -ne $expectedNames.Count) { throw 'SETUP_PAYLOAD_INCOMPLETE' }
  $packageHash = (Get-SquirrelFileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($entries[$packageName].Length -ne (Get-Item -LiteralPath $Package).Length -or (Get-EntryDigest $entries[$packageName] 'SHA256') -ne $packageHash) { throw 'SETUP_EMBEDDED_PACKAGE_MISMATCH' }
  $updaterHash = (Get-SquirrelFileHash -LiteralPath $Updater -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($entries['Update.exe'].Length -ne (Get-Item -LiteralPath $Updater).Length -or (Get-EntryDigest $entries['Update.exe'] 'SHA256') -ne $updaterHash) { throw 'SETUP_EMBEDDED_UPDATER_MISMATCH' }
  if ($Background -and ($entries['background.gif'].Length -ne (Get-Item -LiteralPath $Background).Length -or (Get-EntryDigest $entries['background.gif'] 'SHA256') -ne (Get-SquirrelFileHash -LiteralPath $Background).Hash.ToLowerInvariant())) { throw 'SETUP_EMBEDDED_BACKGROUND_MISMATCH' }
  if ($entries['RELEASES'].Length -gt 4096) { throw 'SETUP_RELEASES_TOO_LARGE' }
  $textReader = [IO.StreamReader]::new($entries['RELEASES'].Open())
  try { $release = $textReader.ReadToEnd().Trim() } finally { $textReader.Dispose() }
  $fields = $release -split '\s+'
  if ($fields.Count -ne 3 -or $fields[0] -notmatch '^[a-fA-F0-9]{40}$' -or $fields[1] -cne $packageName -or $fields[2] -cne [string]$entries[$packageName].Length -or $fields[0].ToLowerInvariant() -ne (Get-EntryDigest $entries[$packageName] 'SHA1')) { throw 'SETUP_EMBEDDED_RELEASES_MISMATCH' }
} finally { $zip.Dispose() }
$receipt = @{schemaVersion=1; setupSha256=(Get-SquirrelFileHash -LiteralPath $Setup).Hash.ToLowerInvariant(); embeddedZipSha256=(Get-SquirrelFileHash -LiteralPath $embeddedPath).Hash.ToLowerInvariant(); packageSha256=$packageHash; updaterSha256=$updaterHash; passed=$true; installedLifecycleVerified=$false; route='pe-resource-data-131-1033'; retainedPayload=$embeddedPath}
if ($ReceiptPath) { New-Item -ItemType Directory -Force (Split-Path ([IO.Path]::GetFullPath($ReceiptPath)) -Parent) | Out-Null; $receipt | ConvertTo-Json | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8 }
Write-Host 'Setup embeds the exact full package, release feed and updater. Installed lifecycle remains separate.'
