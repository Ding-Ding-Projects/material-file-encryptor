param([switch]$PrepareOnly)
$ErrorActionPreference = 'Stop'
function Assert([bool]$condition, [string]$message) { if (!$condition) { throw $message } }
function Digest([string]$path, [string]$algorithm='SHA256') { (Get-FileHash -LiteralPath $path -Algorithm $algorithm).Hash.ToLowerInvariant() }
function Gh([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments) { $result = & gh @Arguments; if ($LASTEXITCODE -ne 0) { throw 'GITHUB_CLI_OPERATION_FAILED' }; return $result }
$repo=$env:GITHUB_REPOSITORY; $source=$env:GITHUB_SHA
Assert ($env:GITHUB_RUN_NUMBER -match '^[1-9][0-9]*$' -and $env:GITHUB_RUN_ATTEMPT -match '^[1-9][0-9]*$') 'INVALID_RUN_IDENTITY'
$tag="v0.1.0-preview.$($env:GITHUB_RUN_NUMBER).$($env:GITHUB_RUN_ATTEMPT)"
$output='release-output'; New-Item -ItemType Directory -Force $output | Out-Null
$directory='out/make/squirrel.windows/x64'
$setup=Join-Path $directory 'MaterialFileEncryptor-Setup.exe'; $releases=Join-Path $directory 'RELEASES'
Assert ((Test-Path $setup) -and (Test-Path $releases)) 'INSTALLER_ASSETS_MISSING'
Assert ((Get-AuthenticodeSignature $setup).Status -eq 'NotSigned') 'EXPECTED_UNSIGNED_SETUP'
$packages=@(Get-ChildItem $directory -Filter '*.nupkg' -File)
Assert (@($packages | Where-Object Name -Like '*-full.nupkg').Count -eq 1) 'EXPECTED_ONE_FULL_PACKAGE'
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
$catalog=Get-Content docs/release-assets/catalog.json -Raw | ConvertFrom-Json
$imageEntry=@($catalog.images | Where-Object id -eq 'hk-dish-0001')[0]
$image=Join-Path 'docs/release-assets' $imageEntry.file
Assert ((Get-Item $image).Length -eq $imageEntry.bytes -and (Digest $image) -eq $imageEntry.sha256) 'DIM_SUM_DIGEST_MISMATCH'
$assets=@($setup,$releases)+@($packages.FullName)+@($image)
$receipt=[ordered]@{schemaVersion=1; sourceCommit=$source; tag=$tag; packageVersion=(Get-Content package.json -Raw | ConvertFrom-Json).version; runId=$env:GITHUB_RUN_ID; runAttempt=$env:GITHUB_RUN_ATTEMPT; buildStartedAtUtc=$env:BUILD_STARTED_AT; packagingCompletedAtUtc=[DateTime]::UtcNow.ToString('o'); testsRunInCI=$false; runtimeVerification='pending independent local receipt'; unsignedInstaller=$true; assets=@($assets | ForEach-Object { @{name=(Split-Path $_ -Leaf); bytes=(Get-Item $_).Length; sha256=Digest $_} })}
$receipt | ConvertTo-Json -Depth 8 | Set-Content "$output/build-provenance.json" -Encoding utf8
$notes=@"
Unsigned Squirrel.Windows x64 preview from ``$source``. Package version $($receipt.packageVersion).

Build and packaging only. CI runs no tests, lint, GUI checks, installation, or updater checks. Runtime verification is pending an independent local receipt. Setup and application are unsigned and may show unknown-publisher warnings.

呢個係未簽署嘅 Windows 預覽版。CI 只負責建置同封裝，冇執行測試、lint、介面、安裝或更新驗證。執行時驗證仍待獨立本機紀錄。

Build started UTC: $($receipt.buildStartedAtUtc). Packaging completed UTC: $($receipt.packagingCompletedAtUtc).

![Classic Har Gow 蝦餃](https://github.com/$repo/releases/download/$tag/$($imageEntry.file))
"@
$notes | Set-Content "$output/release-notes.md" -Encoding utf8
$assets+=@("$output/build-provenance.json")
@{tag=$tag;sourceCommit=$source;prerelease=$true;overwriteAllowed=$false;assets=@($assets | ForEach-Object {Split-Path $_ -Leaf})} | ConvertTo-Json -Depth 5 | Set-Content "$output/release-plan.json" -Encoding utf8
if ($PrepareOnly) { return }
$refs=(Gh @('api',"repos/$repo/git/matching-refs/tags/$tag")) | ConvertFrom-Json
Assert (@($refs | Where-Object ref -eq "refs/tags/$tag").Count -eq 0) 'TAG_ALREADY_EXISTS'
$existing=(Gh @('api','--paginate',"repos/$repo/releases?per_page=100")) | ConvertFrom-Json
Assert (@($existing | Where-Object tag_name -eq $tag).Count -eq 0) 'RELEASE_ALREADY_EXISTS'
$null=Gh (@('release','create',$tag,'--repo',$repo,'--target',$source,'--prerelease','--latest=false','--title',"Material File Encryptor $tag",'--notes-file',"$output/release-notes.md")+$assets)
$published=(Gh @('release','view',$tag,'--repo',$repo,'--json','isDraft,isPrerelease,assets,url')) | ConvertFrom-Json
Assert (!$published.isDraft -and $published.isPrerelease) 'PUBLICATION_INCOMPLETE'
Assert (@($published.assets).Count -eq $assets.Count) 'PUBLISHED_ASSET_SET_MISMATCH'
foreach ($asset in $assets) { Assert (@($published.assets | Where-Object name -eq (Split-Path $asset -Leaf)).Count -eq 1) 'PUBLISHED_ASSET_NAME_MISMATCH' }
$target=(Gh @('api',"repos/$repo/git/ref/tags/$tag")) | ConvertFrom-Json
Assert ($target.object.type -eq 'commit' -and $target.object.sha -eq $source) 'TAG_TARGET_MISMATCH'
$download=Join-Path $env:RUNNER_TEMP ('preview-readback-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $download | Out-Null
$null=Gh @('release','download',$tag,'--repo',$repo,'--dir',$download)
foreach ($asset in $assets) { Assert ((Digest (Join-Path $download (Split-Path $asset -Leaf))) -eq (Digest $asset)) 'DOWNLOADED_ASSET_MISMATCH' }
@{tag=$tag;sourceCommit=$source;url=$published.url;downloadHashesVerified=$true;verifiedAtUtc=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content "$output/publication-receipt.json" -Encoding utf8
