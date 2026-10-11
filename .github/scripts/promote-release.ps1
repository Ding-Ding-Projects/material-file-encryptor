$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../../scripts/squirrel-file-hash.ps1"
function Assert([bool]$value, [string]$code) { if (!$value) { throw $code } }
function Gh([string[]]$Arguments) {
  [Management.Automation.ApplicationInfo]$nativeGh = Get-Command gh.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1
  $result = & $nativeGh.Source @Arguments
  Assert ($LASTEXITCODE -eq 0) 'PROMOTION_GITHUB_OPERATION_FAILED'
  return $result
}
Assert ($env:GITHUB_REF -eq 'refs/heads/main') 'PROMOTION_MAIN_ONLY'
$repo=$env:GITHUB_REPOSITORY; $source=$env:GITHUB_SHA
$tag="v1.$($env:GITHUB_RUN_NUMBER).$($env:GITHUB_RUN_ATTEMPT)"
$inputPath='release-output/promotion-input.json'
Assert ((Get-Item -LiteralPath $inputPath).Length -le 1048576) 'PROMOTION_INPUT_TOO_LARGE'
$plan=Get-Content -LiteralPath $inputPath -Raw | ConvertFrom-Json
Assert ($plan.schemaVersion -eq 1 -and $plan.sourceCommit -ceq $source -and $plan.tag -ceq $tag -and $plan.releaseId -match '^[1-9][0-9]*$') 'PROMOTION_SOURCE_MISMATCH'
Assert (@($plan.assets).Count -ge 4 -and @($plan.assets).Count -le 100) 'PROMOTION_ASSET_SET_INVALID'
$names=@{}
$totalBytes=0L
foreach ($asset in $plan.assets) {
  Assert ($asset.name -cmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$' -and !$names.ContainsKey($asset.name) -and $asset.sha256 -cmatch '^[a-f0-9]{64}$' -and $asset.bytes -gt 0 -and $asset.bytes -le 1572864000) 'PROMOTION_ASSET_INVALID'
  $names[$asset.name]=$true
  $totalBytes+=$asset.bytes
}
Assert ($totalBytes -le 3221225472) 'PROMOTION_TOTAL_BYTES_EXCEEDED'
Assert ($names.ContainsKey('build-provenance.json') -and $names.ContainsKey('RELEASES') -and $names.ContainsKey('MaterialFileEncryptor-Setup.exe')) 'PROMOTION_REQUIRED_ASSETS_MISSING'
$published=(Gh @('api',"repos/$repo/releases/tags/$tag")) | ConvertFrom-Json
Assert (!$published.draft -and !$published.prerelease -and "$($published.id)" -ceq $plan.releaseId -and @($published.assets).Count -eq @($plan.assets).Count) 'PROMOTION_RELEASE_MISMATCH'
$target=(Gh @('api',"repos/$repo/git/ref/tags/$tag")) | ConvertFrom-Json
Assert ($target.ref -ceq "refs/tags/$tag" -and $target.object.type -eq 'commit' -and $target.object.sha -ceq $source) 'PROMOTION_TAG_MISMATCH'
foreach ($asset in $plan.assets) {
  $matches=@($published.assets | Where-Object name -CEQ $asset.name)
  Assert ($matches.Count -eq 1 -and $matches[0].size -eq $asset.bytes) 'PROMOTION_ASSET_METADATA_MISMATCH'
}
$download=Join-Path $env:RUNNER_TEMP ('promotion-readback-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $download | Out-Null
$null=Gh @('release','download',$tag,'--repo',$repo,'--dir',$download)
foreach ($asset in $plan.assets) {
  $file=Join-Path $download $asset.name
  Assert ((Get-Item -LiteralPath $file).Length -eq $asset.bytes -and (Get-SquirrelFileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $asset.sha256) 'PROMOTION_ASSET_HASH_MISMATCH'
}
$channelJson=& node scripts/release-channel.mjs $repo $plan.releaseId $env:GITHUB_REF $source
Assert ($LASTEXITCODE -eq 0) 'RELEASE_CHANNEL_VERIFICATION_FAILED'
@{tag=$tag;sourceCommit=$source;assetsVerified=$true;channel=($channelJson | ConvertFrom-Json);verifiedAtUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content release-output/promotion-receipt.json -Encoding utf8
