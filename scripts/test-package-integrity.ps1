$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('mfe-archive-check-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $fixture | Out-Null
$good = Join-Path $fixture 'valid.nupkg'
$bad = Join-Path $fixture 'corrupt.nupkg'
try {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Add-Type -AssemblyName System.IO.Compression
  $zip = [IO.Compression.ZipFile]::Open($good, [IO.Compression.ZipArchiveMode]::Create)
  try {
    $entry = $zip.CreateEntry('unselected-runtime.txt', [IO.Compression.CompressionLevel]::NoCompression)
    $stream = $entry.Open()
    try { $data = [Text.Encoding]::UTF8.GetBytes('archive-integrity-regression-content'); $stream.Write($data, 0, $data.Length) }
    finally { $stream.Dispose() }
  } finally { $zip.Dispose() }
  & "$PSScriptRoot\package-integrity.ps1" -Packages @($good) -ReceiptPath (Join-Path $fixture 'valid.json')
  $valid = Get-Content (Join-Path $fixture 'valid.json') -Raw | ConvertFrom-Json
  if (!$valid.passed -or $valid.packages[0].entries -ne 1) { throw 'Valid package was not accepted.' }
  $bytes = [IO.File]::ReadAllBytes($good)
  $offset = 30 + [BitConverter]::ToUInt16($bytes, 26) + [BitConverter]::ToUInt16($bytes, 28)
  $bytes[$offset] = $bytes[$offset] -bxor 1
  [IO.File]::WriteAllBytes($bad, $bytes)
  $rejected = $false
  try { & "$PSScriptRoot\package-integrity.ps1" -Packages @($bad) -ReceiptPath (Join-Path $fixture 'corrupt.json') }
  catch { if ($_.Exception.Message -ne 'PACKAGE_ARCHIVE_INTEGRITY_FAILED') { throw }; $rejected = $true }
  $invalid = Get-Content (Join-Path $fixture 'corrupt.json') -Raw | ConvertFrom-Json
  if (!$rejected -or $invalid.passed -or $invalid.packages[0].readerExitCode -eq 0) { throw 'Corrupt unselected entry was accepted.' }
  Write-Host 'Package archive regression: 2 checks passed (valid archive and corrupt unselected entry).'
} finally {
  foreach ($name in @('valid.nupkg', 'corrupt.nupkg', 'valid.json', 'corrupt.json')) { $path = Join-Path $fixture $name; if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path } }
  if (@(Get-ChildItem -LiteralPath $fixture -Force).Count -eq 0) { Remove-Item -LiteralPath $fixture }
}
