$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('squirrel extraction ' + [Guid]::NewGuid().ToString('N'))
$inputFolder = Join-Path $fixture 'input/lib/net45'
New-Item -ItemType Directory -Force $inputFolder | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$nested = Join-Path $inputFolder 'a-source.zip'
$zip = [IO.Compression.ZipFile]::Open($nested, [IO.Compression.ZipArchiveMode]::Create)
try { $entry = $zip.CreateEntry('nested.txt'); $stream = $entry.Open(); try { $bytes = New-Object byte[] 2048; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() } } finally { $zip.Dispose() }
[IO.File]::WriteAllText((Join-Path $inputFolder 'z-after.txt'),'required after nested archive')
$writer = Join-Path $env:LOCALAPPDATA 'MaterialFileEncryptor-BuildTools/7zip-26.04/x64/7za.exe'
$updater = Join-Path $root 'node_modules/electron-winstaller/vendor/Squirrel.exe'
Push-Location (Join-Path $fixture 'input')
try {
  & $writer a (Join-Path $fixture 'default.zip') -tzip -y '*' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'BASELINE_WRITER_FAILED' }
} finally { Pop-Location }
. "$PSScriptRoot/squirrel-zip.ps1"
ConvertTo-SquirrelZip (Join-Path $fixture 'default.zip') (Join-Path $fixture 'corrected.zip')
$rejected = $false
try { & "$PSScriptRoot/squirrel-payload-check.ps1" -Package (Join-Path $fixture 'default.zip') -Updater $updater } catch { if ($_.Exception.Message -like 'SQUIRREL_EXTRACTED_FILE_MISMATCH*') { $rejected = $true } else { throw } }
if (!$rejected) { throw 'BROKEN_STORED_ARCHIVE_WAS_ACCEPTED' }
& "$PSScriptRoot/squirrel-payload-check.ps1" -Package (Join-Path $fixture 'corrected.zip') -Updater $updater
$unsafe = Join-Path $fixture 'unsafe.zip'
$zip = [IO.Compression.ZipFile]::Open($unsafe, [IO.Compression.ZipArchiveMode]::Create)
try { $null = $zip.CreateEntry('../escape.txt') } finally { $zip.Dispose() }
foreach ($operation in @('rewrite','extract')) {
  $rejected = $false
  try {
    if ($operation -eq 'rewrite') { ConvertTo-SquirrelZip $unsafe (Join-Path $fixture 'unsafe-rewritten.zip') }
    else { & "$PSScriptRoot/squirrel-payload-check.ps1" -Package $unsafe -Updater $updater }
  } catch { if ($_.Exception.Message -eq 'UNSAFE_PACKAGE_PATH') { $rejected=$true } else { throw } }
  if (!$rejected) { throw 'UNSAFE_ARCHIVE_WAS_ACCEPTED' }
}
if (Test-Path -LiteralPath (Join-Path $fixture 'unsafe-rewritten.zip')) { throw 'UNSAFE_ARCHIVE_WAS_WRITTEN' }
Write-Host 'PASS: stored nested archive rejected; corrected Squirrel extraction matched every file.'
Write-Host 'PASS: unsafe entry rejected before recompression and extraction.'
