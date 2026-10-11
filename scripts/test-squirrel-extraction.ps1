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
$vendor = Join-Path $fixture 'vendor'; New-Item -ItemType Directory $vendor | Out-Null
Copy-Item -LiteralPath $writer -Destination (Join-Path $vendor '7za-real.exe')
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:exe ("/out:" + (Join-Path $vendor '7z.exe')) (Join-Path $PSScriptRoot 'SquirrelArchiveWriter.cs')
if ($LASTEXITCODE -ne 0) { throw 'WRITER_COMPILATION_FAILED' }
Push-Location (Join-Path $fixture 'input')
try {
  & $writer a (Join-Path $fixture 'default.zip') -tzip -y '*' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'BASELINE_WRITER_FAILED' }
  & (Join-Path $vendor '7z.exe') a (Join-Path $fixture 'corrected.zip') -tzip -y '*' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'CORRECTED_WRITER_FAILED' }
} finally { Pop-Location }
$rejected = $false
try { & "$PSScriptRoot/squirrel-payload-check.ps1" -Package (Join-Path $fixture 'default.zip') -Updater $updater } catch { if ($_.Exception.Message -like 'SQUIRREL_EXTRACTED_FILE_MISMATCH*') { $rejected = $true } else { throw } }
if (!$rejected) { throw 'BROKEN_STORED_ARCHIVE_WAS_ACCEPTED' }
& "$PSScriptRoot/squirrel-payload-check.ps1" -Package (Join-Path $fixture 'corrected.zip') -Updater $updater
Write-Host 'PASS: stored nested archive rejected; corrected Squirrel extraction matched every file.'
