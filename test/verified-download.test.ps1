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
$file=New-Case 'concurrent-valid-cache'; [IO.File]::WriteAllBytes($file,$bad)
$script:raceFile=$file; $script:raceArmed=$true; $script:originalDigest=${function:Get-BootstrapDigest}
function Get-BootstrapDigest([string]$filename,[string]$algorithm='SHA256') {
  $result=& $script:originalDigest $filename $algorithm
  if ($script:raceArmed -and $filename -eq $script:raceFile) { $script:raceArmed=$false; [IO.File]::WriteAllBytes($filename,$good) }
  return $result
}
try {
  $script:calls=@(); Get-Verified $entry $file $transport
  Assert ((& $script:originalDigest $file 'SHA512') -eq $expected) 'Concurrent valid cache lost'
  Assert ($script:calls.Count -eq 0) 'Concurrent valid cache caused download'
  Assert (@(Get-ChildItem (Split-Path $file) -Recurse -Filter '*.json').Count -eq 0) 'Valid cache labeled invalid'
} finally { Set-Item Function:Get-BootstrapDigest $script:originalDigest }
Write-Host 'PASS: deterministic valid concurrent cache replacement retained without download.'
foreach ($destinationValid in @($true,$false)) {
  $file=New-Case ('restore-collision-' + $destinationValid); [IO.File]::WriteAllBytes($file,$bad)
  $script:raceFile=$file; $script:raceArmed=$true; $script:claimArmed=$true
  function Get-BootstrapDigest([string]$filename,[string]$algorithm='SHA256') {
    $result=& $script:originalDigest $filename $algorithm
    if ($script:raceArmed -and $filename -eq $script:raceFile) { $script:raceArmed=$false; [IO.File]::WriteAllBytes($filename,$good) }
    elseif ($script:claimArmed -and [IO.Path]::GetFileName($filename) -like '.cache-claim-*') {
      $script:claimArmed=$false
      $replacement=if($destinationValid){$good}else{$bad}
      [IO.File]::WriteAllBytes($script:raceFile,$replacement)
    }
    return $result
  }
  try {
    $script:calls=@(); $failed=$false
    try { Get-Verified $entry $file $transport } catch { $failed=$true }
    Assert ($failed -eq !$destinationValid) 'Wrong restore collision verdict'
    Assert ($script:calls.Count -eq 0) 'Restore collision reached network'
    $expectedText=if($destinationValid){'verified fixture'}else{'corrupt fixture'}
    Assert ([IO.File]::ReadAllText($file) -ceq $expectedText) 'Destination overwritten'
    $receipts=@(Get-ChildItem (Join-Path (Split-Path $file) 'download-evidence') -Filter '*.json')
    Assert ($receipts.Count -eq 1) 'Valid claim receipt missing'
    $receipt=Get-Content $receipts[0].FullName -Raw|ConvertFrom-Json
    $outcome=if($destinationValid){'redundant-valid-cache'}else{'valid-cache-restore-conflict'}
    Assert ($receipt.outcome -ceq $outcome) 'Valid claim mislabeled'
    Assert ($receipt.actualDigest -ceq $expected) 'Valid claim changed'
    Assert ([IO.File]::ReadAllText((Join-Path $receipts[0].DirectoryName $receipt.quarantine)) -ceq 'verified fixture') 'Valid claim not retained'
  } finally { Set-Item Function:Get-BootstrapDigest $script:originalDigest }
}
Write-Host 'PASS: valid and invalid restore collisions preserve both sequences with correct verdicts.'
foreach ($kind in @('evidence', 'parent', 'cache')) {
  $file=New-Case ('junction-' + $kind); $dir=Split-Path $file
  $outside=Join-Path $root ('outside-' + $kind); New-Item -ItemType Directory $outside|Out-Null
  [IO.File]::WriteAllText((Join-Path $outside 'sentinel.txt'), 'unchanged')
  if ($kind -eq 'evidence') {
    [IO.File]::WriteAllBytes($file,$bad)
    New-Item -ItemType Junction -Path (Join-Path $dir 'download-evidence') -Target $outside|Out-Null
  } elseif ($kind -eq 'parent') {
    $link=Join-Path $dir 'linked'; New-Item -ItemType Junction -Path $link -Target $outside|Out-Null
    $file=Join-Path $link 'sdk.zip'
  } else {
    # File symbolic links may need elevation; a junction at the cache leaf still must be rejected.
    New-Item -ItemType Junction -Path $file -Target $outside|Out-Null
  }
  $script:calls=@(); $failed=$false
  try { Get-Verified $entry $file $transport } catch { $failed=$_.Exception.Message -match 'reparse points' }
  Assert $failed 'Linked dependency path accepted'
  Assert ($script:calls.Count -eq 0) 'Linked path reached transport'
  Assert (@(Get-ChildItem -LiteralPath $outside -Force).Count -eq 1) 'Outside directory changed'
  Assert ([IO.File]::ReadAllText((Join-Path $outside 'sentinel.txt')) -ceq 'unchanged') 'Outside sentinel changed'
  if ($kind -eq 'evidence') { Assert ([IO.File]::ReadAllText($file) -ceq 'corrupt fixture') 'Bad cache moved before path rejection' }
}
Write-Host 'PASS: three real Windows junction negatives; outside fixtures retained untouched.'
Write-Host 'PASS: six verified-download scenarios; no network used.'
Write-Host "Retained synthetic evidence: $root"
