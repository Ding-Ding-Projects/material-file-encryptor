$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root
. ./scripts/bootstrap.ps1 -RuntimeToolsOnly -InstallerTools
$fixture=Join-Path $env:TEMP ('mfe-crc-regression-'+[Guid]::NewGuid().ToString('N'))
$input=Join-Path $fixture 'input'; $valid=Join-Path $fixture 'valid'; $invalid=Join-Path $fixture 'invalid'
New-Item -ItemType Directory -Force $input,$valid,$invalid | Out-Null
[IO.File]::WriteAllBytes((Join-Path $input 'payload.bin'),[byte[]](0..255))
[IO.File]::WriteAllText((Join-Path $input 'manifest.txt'),'bounded package CRC regression')
$vendorSource=Join-Path $fixture 'vendor-source'
$vendorOutput=Join-Path $fixture 'vendor-output'
New-Item -ItemType Directory $vendorSource | Out-Null
foreach($name in @('Squirrel.exe','7z.exe','7z-x64.exe')){[IO.File]::WriteAllText((Join-Path $vendorSource $name),'old helper fixture')}
$receiptPath=Join-Path $fixture 'archiver.json'
& ./scripts/prepare-squirrel-vendor.ps1 -VendorSource $vendorSource -OutputDirectory $vendorOutput -ModernExecutable $env:MFE_SEVENZIP_EXECUTABLE -License $env:MFE_SEVENZIP_LICENSE -ExpectedSha256 $manifest.sevenZip.standaloneSha256 -ExpectedVersion $manifest.sevenZip.version -ReceiptPath $receiptPath
$receipt=Get-Content $receiptPath -Raw | ConvertFrom-Json
if(!$receipt.verifiedBeforePackaging -or $receipt.canonicalExecutable -ne '7z.exe' -or $receipt.executables.Count -ne 2){throw 'Canonical Squirrel tool receipt missing'}
$canonicalTool=Join-Path $vendorOutput '7z.exe'
Push-Location $input
try { & $canonicalTool a (Join-Path $valid 'fixture-full.nupkg') -tzip -mmt=off payload.bin manifest.txt | Out-Null; if($LASTEXITCODE -ne 0){throw 'Pinned archive creation failed'} }
finally { Pop-Location }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-package-crc.ps1 -PackageDirectory $valid
if($LASTEXITCODE -ne 0){throw 'Valid archive rejected'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead((Join-Path $valid 'fixture-full.nupkg'))
try {
 foreach($entry in $zip.Entries){$stream=$entry.Open();$hash=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','');$expected=(Get-FileHash (Join-Path $input $entry.FullName)).Hash;if($actual -ne $expected){throw 'Round-trip bytes changed'}}finally{$stream.Dispose();$hash.Dispose()}}
} finally {$zip.Dispose()}
$corrupt=Join-Path $invalid 'fixture-full.nupkg'; Copy-Item (Join-Path $valid 'fixture-full.nupkg') $corrupt
$bytes=[IO.File]::ReadAllBytes($corrupt);$changed=$false
for($i=0;$i -lt $bytes.Length-20;$i++){if([BitConverter]::ToUInt32($bytes,$i)-eq 0x02014b50){$bytes[$i+16]=$bytes[$i+16] -bxor 1;$changed=$true;break}}
if(!$changed){throw 'CRC mutation fixture missing central entry'}
[IO.File]::WriteAllBytes($corrupt,$bytes)
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-package-crc.ps1 -PackageDirectory $invalid
if($LASTEXITCODE -eq 0){throw 'Invalid CRC accepted'}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/verify-package-crc.ps1 -PackageDirectory $valid
if($LASTEXITCODE -ne 0){throw 'Restored archive rejected'}
Write-Host 'PASS pinned modern archive round-trip bytes, all-entry CRC, deliberate CRC rejection, restored validation.'

