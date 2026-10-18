param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/../../scripts/squirrel-file-hash.ps1"
. "$PSScriptRoot/../../scripts/squirrel-branding.ps1"
function Assert([bool]$condition, [string]$message) { if (!$condition) { throw $message } }
function Digest([string]$path, [string]$algorithm='SHA256') { (Get-SquirrelFileHash -LiteralPath $path -Algorithm $algorithm).Hash.ToLowerInvariant() }
function Gh([string[]]$Arguments) { [Management.Automation.ApplicationInfo]$nativeGh = Get-Command gh.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1; $result = & $nativeGh.Source @Arguments; if ($LASTEXITCODE -ne 0) { throw 'GITHUB_CLI_OPERATION_FAILED' }; return $result }
$repo=$env:GITHUB_REPOSITORY; $source=$env:GITHUB_SHA
$workflowUrl="https://github.com/$repo/actions/runs/$($env:GITHUB_RUN_ID)"
$workflowStarted=(Gh @('api',"repos/$repo/actions/runs/$($env:GITHUB_RUN_ID)/jobs",'--jq','.jobs | map(.started_at) | min'))
Assert (![string]::IsNullOrWhiteSpace($workflowStarted)) 'WORKFLOW_START_UNAVAILABLE'
$workflowStartedUtc=[DateTimeOffset]::Parse($workflowStarted).ToUniversalTime()
Assert ($env:GITHUB_RUN_NUMBER -match '^[1-9][0-9]*$' -and $env:GITHUB_RUN_ATTEMPT -match '^[1-9][0-9]*$') 'INVALID_RUN_IDENTITY'
$tag="v1.$($env:GITHUB_RUN_NUMBER).$($env:GITHUB_RUN_ATTEMPT)"
$packageVersion=$tag.Substring(1)
& node scripts/release-version.mjs --verify $packageVersion
Assert ($LASTEXITCODE -eq 0) 'RELEASE_MANIFEST_VERIFICATION_FAILED'
$output='release-output'; New-Item -ItemType Directory -Force $output | Out-Null
$directory='out/make/squirrel.windows/x64'
Assert (!(Test-Path -LiteralPath (Join-Path $directory 'reassembly-unsettled.json'))) 'SQUIRREL_PREVIOUS_PRODUCER_UNSETTLED'
$setup=Join-Path $directory 'MaterialFileEncryptor-Setup.exe'; $releases=Join-Path $directory 'RELEASES'
Assert ((Test-Path $setup) -and (Test-Path $releases)) 'INSTALLER_ASSETS_MISSING'
Assert ((Get-AuthenticodeSignature $setup).Status -eq 'NotSigned') 'EXPECTED_UNSIGNED_SETUP'
$packages=@(Get-ChildItem $directory -Filter '*.nupkg' -File)
Assert (@($packages | Where-Object Name -Like '*-full.nupkg').Count -eq 1) 'EXPECTED_ONE_FULL_PACKAGE'
Assert (@($packages | Where-Object Name -CEQ "MaterialFileEncryptor-$packageVersion-full.nupkg").Count -eq 1) 'RELEASE_PACKAGE_NAME_MISMATCH'
$fullPackage=@($packages | Where-Object Name -Like '*-full.nupkg')[0]
& scripts/squirrel-payload-check.ps1 -Package $fullPackage.FullName -Updater 'node_modules/electron-winstaller/vendor/Squirrel.exe' -ExpectedVersion $packageVersion -ExpectedSource $source
& node scripts/desktop-icons.mjs check
Assert ($LASTEXITCODE -eq 0) 'SQUIRREL_BRANDING_INVALID'
$setupIcon=[IO.Path]::GetFullPath('assets/branding/app.ico')
$verificationVendor=Join-Path ([IO.Path]::GetTempPath()) ('mfe-publish-vendor-'+[Guid]::NewGuid().ToString('N'))
$brandedUpdater=Copy-SquirrelBrandedVendor -Package $fullPackage.FullName -Icon $setupIcon -VendorDirectory 'node_modules/electron-winstaller/vendor' -Destination $verificationVendor
& scripts/squirrel-setup-check.ps1 -Setup $setup -Package $fullPackage.FullName -Updater $brandedUpdater -SetupIcon $setupIcon -ReleaseIndex $releases
$indexed=@{}
foreach ($line in Get-Content $releases) {
 if (!$line.Trim()) { continue }
 Assert ($line -match '^([a-fA-F0-9]{40})\s+([A-Za-z0-9_.-]+\.nupkg)\s+(\d+)$') 'INVALID_RELEASES_ENTRY'
 $hash=$Matches[1]; $name=$Matches[2]; $bytes=[long]$Matches[3]
 Assert (!$name.Contains('..') -and !$indexed.ContainsKey($name)) 'INVALID_PACKAGE_NAME'
 $path=Join-Path $directory $name
 Assert ((Test-Path $path) -and (Get-Item $path).Length -eq $bytes -and (Digest $path 'SHA1') -eq $hash.ToLowerInvariant()) 'RELEASES_DIGEST_MISMATCH'
 $indexed[$name]=$true
}
Assert ($indexed.Count -eq $packages.Count) 'PACKAGE_SET_MISMATCH'
foreach ($package in $packages) { Assert ($indexed.ContainsKey($package.Name)) 'UNINDEXED_PACKAGE' }
& scripts/package-integrity.ps1 -Packages @($packages.FullName)
# Resolve a public reference only. Consumer releases never attach copied photos.
function Resolve-PublicReleasePhoto {
 $photoRepo='Ding-Ding-Projects/dim-sum-photos'
 $head=((Gh @('api',"repos/$photoRepo/commits/main")) -join "`n") | ConvertFrom-Json
 Assert ($head.sha -match '^[a-f0-9]{40}$') 'PUBLIC_PHOTO_REVISION_REQUIRED'
 $catalog=((Gh @('api',"repos/$photoRepo/contents/catalog/index.json?ref=$($head.sha)",'-H','Accept: application/vnd.github.raw+json')) -join "`n") | ConvertFrom-Json
 $rows=@($catalog.dishes | Where-Object id -eq 'hk-dish-0001')
 Assert ($rows.Count -eq 1) 'PUBLIC_PHOTO_CATALOG_ROW_REQUIRED'
 $dish=$rows[0]
 Assert ($dish.image.path -match '^images/([-a-zA-Z0-9_.]+\.(png|jpe?g|webp))$') 'PUBLIC_PHOTO_PATH_INVALID'
 $photoName=$Matches[1]
 foreach($name in @($dish.name.en,$dish.name.zhHant)){Assert ($name -is [string] -and $name.Length -gt 0 -and $name.Length -le 180 -and $name -notmatch '[\x00-\x1f\x7f\[\]<>\x60]') 'PUBLIC_PHOTO_NAME_INVALID'}
 for($page=1;$page -le 3;$page++){
  $releaseJson=(Gh @('api',"repos/$photoRepo/releases?per_page=100&page=$page")) -join "`n"
  $releases=ConvertFrom-Json $releaseJson
  foreach($release in $releases){
   if($release.draft -or $release.prerelease -or $release.tag_name -notmatch '^catalog-v1[A-Za-z0-9._-]*$'){continue}
   foreach($asset in @($release.assets)){
    $expected="https://github.com/$photoRepo/releases/download/$($release.tag_name)/$photoName"
    if($asset.name -ceq $photoName -and $asset.state -eq 'uploaded' -and $asset.size -gt 0 -and $asset.digest -match '^sha256:[a-f0-9]{64}$' -and $asset.browser_download_url -ceq $expected){
     return [ordered]@{sourceRepository=$photoRepo;catalogRevision=$head.sha;nameEnglish=$dish.name.en;nameTraditionalChinese=$dish.name.zhHant;release=$release.tag_name;url=$expected;sha256=$asset.digest.Substring(7);bytes=$asset.size}
    }
   }
  }
  if($releases.Count -lt 100){break}
 }
 throw 'PUBLIC_CATALOG_IMAGE_REQUIRED'
}
$photoReference=Resolve-PublicReleasePhoto
$imageUrl=$photoReference.url
$assets=@($setup,$releases)+@($packages.FullName)
$ciTestGates=@()
if ($env:MFE_VERIFIED_CI_TEST_GATES -ceq 'isolated-vault-sessions,encrypted-image-offline') {
 $ciTestGates=@('isolated-vault-sessions','encrypted-image-offline')
}
$ciTestSummary='No CI test-gate receipt was supplied. Do not infer runtime verification from this package.'
$ciTestSummaryZh='未提供 CI 測試關卡紀錄，唔可以單憑封裝結果推斷執行時驗證。'
if ($ciTestGates.Count -gt 0) {
 $ciTestSummary='CI passed isolated native vault-session tests and offline encrypted-image workflow tests with mocked Docker and network operations.'
 $ciTestSummaryZh='CI 已通過獨立原生保管庫工作階段測試，以及使用模擬 Docker 同網絡操作嘅離線加密映像工作流程測試。'
}
$receipt=[ordered]@{schemaVersion=1; photoReference=$photoReference; sourceCommit=$source; tag=$tag; packageVersion=(Get-Content package.json -Raw | ConvertFrom-Json).version; runId=$env:GITHUB_RUN_ID; runAttempt=$env:GITHUB_RUN_ATTEMPT; workflowUrl=$workflowUrl; workflowStartedAtUtc=$workflowStartedUtc.ToString('o'); buildStartedAtUtc=$env:BUILD_STARTED_AT; packagingCompletedAtUtc=[DateTime]::UtcNow.ToString('o'); testsRunInCI=($ciTestGates.Count -gt 0); ciTestGates=$ciTestGates; runtimeVerification='pending independent local receipt'; unsignedInstaller=$true; assets=@($assets | ForEach-Object { @{name=(Split-Path $_ -Leaf); bytes=(Get-Item $_).Length; sha256=Digest $_} })}
$receipt | ConvertTo-Json -Depth 8 | Set-Content "$output/build-provenance.json" -Encoding utf8
$notes=@"
Unsigned Squirrel.Windows x64 release from ``$source``. Package version $($receipt.packageVersion).

$ciTestSummary CI does not verify GUI interactions, installation, updater behavior, real simultaneous mounts, or Docker Hub uploads. Installed runtime verification is pending an independent local receipt. Setup and application are unsigned and may show unknown-publisher warnings.

呢個係未簽署嘅 Windows 發行版。$ciTestSummaryZh CI 冇驗證介面操作、安裝、更新、實際同時掛載或 Docker Hub 上傳。安裝後嘅執行時驗證仍待獨立本機紀錄。

Workflow run: $workflowUrl

Build started UTC: $($receipt.buildStartedAtUtc). Packaging completed UTC: $($receipt.packagingCompletedAtUtc).

Code name: $($photoReference.nameEnglish) / $($photoReference.nameTraditionalChinese). Photo is linked from the authoritative public catalog release, not copied into this release.

![$($photoReference.nameEnglish) $($photoReference.nameTraditionalChinese)]($imageUrl)
"@
$notes | Set-Content "$output/release-notes.md" -Encoding utf8
$assets+=@("$output/build-provenance.json")
@{tag=$tag;sourceCommit=$source;isDraft=$false;isPrerelease=$false;latest='false-until-verified-current-main';overwriteAllowed=$false;assets=@($assets | ForEach-Object {Split-Path $_ -Leaf})} | ConvertTo-Json -Depth 5 | Set-Content "$output/release-plan.json" -Encoding utf8
if ($PrepareOnly) { return }
$refs=(Gh @('api',"repos/$repo/git/matching-refs/tags/$tag")) | ConvertFrom-Json
Assert (@($refs | Where-Object ref -eq "refs/tags/$tag").Count -eq 0) 'TAG_ALREADY_EXISTS'
$existing=@(Gh @('api','--paginate',"repos/$repo/releases?per_page=100",'--jq','.[].tag_name'))
Assert ($existing -notcontains $tag) 'RELEASE_ALREADY_EXISTS'
$null=Gh (@('release','create',$tag,'--repo',$repo,'--target',$source,'--latest=false','--title',"Material File Encryptor $tag",'--notes-file',"$output/release-notes.md")+$assets)
$releaseId=Gh @('api',"repos/$repo/releases/tags/$tag",'--jq','.id')
$published=(Gh @('release','view',$tag,'--repo',$repo,'--json','isDraft,isPrerelease,assets,url')) | ConvertFrom-Json
Assert (!$published.isDraft -and !$published.isPrerelease) 'PUBLICATION_INCOMPLETE'
Assert (@($published.assets).Count -eq $assets.Count) 'PUBLISHED_ASSET_SET_MISMATCH'
foreach ($asset in $assets) { Assert (@($published.assets | Where-Object name -eq (Split-Path $asset -Leaf)).Count -eq 1) 'PUBLISHED_ASSET_NAME_MISMATCH' }
$target=(Gh @('api',"repos/$repo/git/ref/tags/$tag")) | ConvertFrom-Json
Assert ($target.object.type -eq 'commit' -and $target.object.sha -eq $source) 'TAG_TARGET_MISMATCH'
$download=Join-Path $env:RUNNER_TEMP ('preview-readback-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $download | Out-Null
$null=Gh @('release','download',$tag,'--repo',$repo,'--dir',$download)
foreach ($asset in $assets) { Assert ((Digest (Join-Path $download (Split-Path $asset -Leaf))) -eq (Digest $asset)) 'DOWNLOADED_ASSET_MISMATCH' }
$channel = @{channel='download-only';promoted=$false;reason='awaiting-serialized-promotion'}
@{schemaVersion=1;tag=$tag;sourceCommit=$source;releaseId="$releaseId";assets=@($assets | ForEach-Object { @{name=(Split-Path $_ -Leaf);bytes=(Get-Item $_).Length;sha256=Digest $_} })} | ConvertTo-Json -Depth 5 | Set-Content "$output/promotion-input.json" -Encoding utf8
@{tag=$tag;sourceCommit=$source;url=$published.url;downloadHashesVerified=$true;channel=$channel;verifiedAtUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 5 | Set-Content "$output/publication-receipt.json" -Encoding utf8

$workflowCompletedUtc=[DateTimeOffset]::UtcNow
$workflowDuration=$workflowCompletedUtc-$workflowStartedUtc
$durationText='{0:00}:{1:00}:{2:00}' -f [Math]::Floor($workflowDuration.TotalHours),$workflowDuration.Minutes,$workflowDuration.Seconds
$notes += "`nWorkflow started: $($workflowStartedUtc.ToString('o'))`nWorkflow completed: $($workflowCompletedUtc.ToString('o'))`nWorkflow duration: $durationText`n"
$notes | Set-Content "$output/release-notes.md" -Encoding utf8
$null=Gh @('release','edit',$tag,'--repo',$repo,'--notes-file',"$output/release-notes.md")
$publishedNotes=Gh @('release','view',$tag,'--repo',$repo,'--json','body','--jq','.body')
Assert (($publishedNotes -join "`n").Replace("`r`n","`n").Trim() -eq $notes.Replace("`r`n","`n").Trim()) 'RELEASE_TIMING_NOTES_MISMATCH'
@{runId=$env:GITHUB_RUN_ID;sourceCommit=$source;workflowStartedAtUtc=$workflowStartedUtc.ToString('o');workflowCompletedAtUtc=$workflowCompletedUtc.ToString('o');workflowDuration=$durationText} | ConvertTo-Json | Set-Content "$output/workflow-timing.json" -Encoding utf8
