function Copy-SquirrelBrandedVendor {
  param([Parameter(Mandatory)][string]$Package, [Parameter(Mandatory)][string]$Updater,
    [Parameter(Mandatory)][string]$VendorDirectory, [Parameter(Mandatory)][string]$Destination)
  if (Test-Path -LiteralPath $Destination) { throw 'SQUIRREL_BRANDED_VENDOR_EXISTS' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $updaterPath = [IO.Path]::GetFullPath($Updater)
  $expected = (Get-SquirrelFileHash -LiteralPath $updaterPath -Algorithm SHA256).Hash.ToLowerInvariant()
  $zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Package))
  try {
    $entries = @($zip.Entries | Where-Object { $_.FullName -cmatch '^lib/[^/]+/Squirrel\.exe$' })
    if ($entries.Count -ne 1) { throw 'SQUIRREL_PACKAGE_UPDATER_REQUIRED' }
    $stream = $entries[0].Open(); $hasher = [Security.Cryptography.SHA256]::Create()
    try { $actual = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
    finally { $hasher.Dispose(); $stream.Dispose() }
    if ($actual -cne $expected -or $entries[0].Length -ne (Get-Item -LiteralPath $updaterPath).Length) { throw 'SQUIRREL_PACKAGE_UPDATER_MISMATCH' }
  } finally { $zip.Dispose() }
  # Preserve the original vendor tools. Releasify embeds the assembly executing
  # beside these tools, so use the exact updater already branded by the maker.
  Copy-Item -LiteralPath $VendorDirectory -Destination $Destination -Recurse
  $staged = Join-Path $Destination 'Squirrel.exe'
  Copy-Item -LiteralPath $updaterPath -Destination $staged -Force
  if ((Get-SquirrelFileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected) { throw 'SQUIRREL_BRANDED_VENDOR_MISMATCH' }
  return $staged
}
