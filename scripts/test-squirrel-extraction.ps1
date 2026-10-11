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
$metadata = Join-Path $fixture 'metadata'
New-Item -ItemType Directory -Force (Join-Path $metadata 'src/shared'), (Join-Path $inputFolder 'resources') | Out-Null
[IO.File]::WriteAllText((Join-Path $metadata 'package.json'),'{"version":"1.2.3"}')
$source = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
[IO.File]::WriteAllText((Join-Path $metadata 'src/shared/build-metadata.json'),('{"version":"1.2.3","sourceCommit":"' + $source + '"}'))
[IO.File]::WriteAllText((Join-Path $fixture 'input/fixture.nuspec'),'<package><metadata><id>Fixture</id><version>1.2.3</version></metadata></package>')
& node -e "require('@electron/asar').createPackage(process.argv[1],process.argv[2]).catch(error=>{console.error(error.message);process.exitCode=1})" $metadata (Join-Path $inputFolder 'resources/app.asar')
if ($LASTEXITCODE -ne 0) { throw 'ASAR_FIXTURE_FAILED' }
# Exercise the framework digest without the command that was unavailable in the
# production child host. Any accidental dependency on that command must fail.
function Get-FileHash { throw 'UTILITY_HASH_COMMAND_MUST_NOT_BE_USED' }
. "$PSScriptRoot/squirrel-file-hash.ps1"
$known = Join-Path $fixture 'digest.txt'
[IO.File]::WriteAllText($known,'abc',[Text.UTF8Encoding]::new($false))
if ((Get-SquirrelFileHash $known -Algorithm SHA1).Hash -cne 'A9993E364706816ABA3E25717850C26C9CD0D89D') { throw 'SHA1_KNOWN_DIGEST_MISMATCH' }
if ((Get-SquirrelFileHash $known).Hash -cne 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD') { throw 'SHA256_KNOWN_DIGEST_MISMATCH' }
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
& "$PSScriptRoot/squirrel-payload-check.ps1" -Package (Join-Path $fixture 'corrected.zip') -Updater $updater -ExpectedVersion '1.2.3' -ExpectedSource $source
foreach ($mismatch in @('version','source')) {
  $rejected = $false
  $expectedVersion = if ($mismatch -eq 'version') { '9.9.9' } else { '1.2.3' }
  $expectedSource = if ($mismatch -eq 'source') { 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' } else { $source }
  try { & "$PSScriptRoot/squirrel-payload-check.ps1" -Package (Join-Path $fixture 'corrected.zip') -Updater $updater -ExpectedVersion $expectedVersion -ExpectedSource $expectedSource }
  catch { if ($_.Exception.Message -in @('PACKAGE_SPEC_VERSION_MISMATCH','PACKAGE_VERSION_OR_SOURCE_MISMATCH')) { $rejected=$true } else { throw } }
  if (!$rejected) { throw 'MISMATCHED_PACKAGE_METADATA_WAS_ACCEPTED' }
}
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
Write-Host 'PASS: native ASAR metadata verified; wrong version/source rejected; framework SHA-1/SHA-256 matched known digests without the Utility hash command.'
