$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '../scripts/verified-download.ps1')
$root = Join-Path ([IO.Path]::GetTempPath()) ('verified-download-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $root | Out-Null
function Assert($condition, $message) { if (!$condition) { throw $message } }
function New-Case($name) { $dir=Join-Path $root $name; New-Item -ItemType Directory $dir|Out-Null; return (Join-Path $dir 'sdk.zip') }
$good=[Text.Encoding]::UTF8.GetBytes('verified fixture'); $bad=[Text.Encoding]::UTF8.GetBytes('corrupt fixture')
$hash=[Security.Cryptography.SHA512]::Create(); try { $expected=([BitConverter]::ToString($hash.ComputeHash($good))).Replace('-','').ToLowerInvariant() } finally {$hash.Dispose()}
$entry=@{version='fixture';url='https://primary.example/sdk.zip';fallbackUrls=@('https://fallback.example/sdk.zip');sha512=$expected}
$script:calls=@()
$transport={param($url,$stream,$timeout) $script:calls+= $url; Assert ($timeout -eq 120) 'Timeout missing'; $stream.Write($good,0,$good.Length); return 200}
$file=New-Case 'offline'; [IO.File]::WriteAllBytes($file,$good); Get-Verified $entry $file {throw 'Offline transport must not run'}; Assert ((Get-BootstrapDigest $file 'SHA512') -eq $expected) 'Valid cache changed'
$file=New-Case 'corrupt-cache'; [IO.File]::WriteAllBytes($file,$bad); Get-Verified $entry $file $transport; $receipts=@(Get-ChildItem (Join-Path (Split-Path $file) 'download-evidence') -Filter '*.json'); Assert ($receipts.Count -eq 1) 'Corrupt cache receipt missing'; $receipt=Get-Content $receipts[0].FullName -Raw|ConvertFrom-Json; Assert ($receipt.outcome -eq 'invalid-cache') 'Cache outcome missing'; Assert ([IO.File]::ReadAllText((Join-Path $receipts[0].DirectoryName $receipt.quarantine)) -eq 'corrupt fixture') 'Corrupt cache not preserved'
$script:calls=@(); $file=New-Case 'fallback'; Get-Verified $entry $file {param($url,$stream) $script:calls+=$url; $bytes=if($url -like '*primary*'){$bad}else{$good}; $stream.Write($bytes,0,$bytes.Length); return 200}; Assert ($script:calls.Count -eq 2) 'Distinct fallback not attempted'; Assert ((Get-BootstrapDigest $file 'SHA512') -eq $expected) 'Invalid publication'
foreach($mode in @('mismatch','partial','status')) {
  $script:calls=@(); $file=New-Case $mode; $failed=$false
  try { Get-Verified $entry $file {param($url,$stream) $script:calls+=$url; $stream.Write($bad,0,$bad.Length); if($mode -eq 'partial'){throw 'Synthetic transport failure'}; if($mode -eq 'status'){return 503}; return 200} } catch {$failed=$true}
  Assert $failed 'Invalid downloads accepted'; Assert (!(Test-Path $file)) 'Invalid cache published'; Assert ($script:calls.Count -eq 2) 'Source retried or skipped'; $receipts=@(Get-ChildItem (Join-Path (Split-Path $file) 'download-evidence') -Filter '*.json'); Assert ($receipts.Count -eq 2) 'Attempt receipts missing'; Assert (@(Get-ChildItem $receipts[0].DirectoryName -Filter '*.bin').Count -eq 2) 'Rejected bytes missing'; Assert (@(Get-ChildItem (Split-Path $file) -Filter '*.tmp').Count -eq 0) 'Temporary not quarantined'
}
Assert ($entry.sha512 -ceq $expected) 'Pin mutated'
Write-Host 'PASS: six verified-download scenarios; no network used.'
Write-Host "Retained synthetic evidence: $root"
