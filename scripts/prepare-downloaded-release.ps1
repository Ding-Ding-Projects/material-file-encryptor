param([Parameter(Mandatory)][string]$DownloadedDirectory,[Parameter(Mandatory)][string]$TargetWorktree,[Parameter(Mandatory)][string]$ReleaseMetadata,[Parameter(Mandatory)][string]$Tag,[Parameter(Mandatory)][string]$ExpectedSource)
$ErrorActionPreference='Stop'
function Require([bool]$Condition,[string]$Message){if(!$Condition){throw $Message}}
function Digest([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
$download=(Resolve-Path -LiteralPath $DownloadedDirectory).Path
$target=(Resolve-Path -LiteralPath $TargetWorktree).Path
Require ($ExpectedSource -match '^[0-9a-f]{40}$') 'SOURCE_MISMATCH'
Require (@(& git -C $target status --porcelain).Count -eq 0) 'SOURCE_NOT_CLEAN'
$release=Get-Content -LiteralPath $ReleaseMetadata -Raw|ConvertFrom-Json
$provenance=Get-Content -LiteralPath (Join-Path $download 'build-provenance.json') -Raw|ConvertFrom-Json
Require ($release.draft -is [bool] -and $release.prerelease -is [bool]) 'RELEASE_FLAGS_REQUIRED'
$sourcePackageText = & git -C $target show "${ExpectedSource}:package.json"
Require ($LASTEXITCODE -eq 0) 'PAYLOAD_SOURCE_NOT_AVAILABLE'
$sourcePackage = $sourcePackageText | ConvertFrom-Json
Require ($provenance.packageVersion -eq $sourcePackage.version) 'SOURCE_PACKAGE_VERSION_MISMATCH'
Require (!$release.draft -and !$release.prerelease -and $release.target_commitish -eq $ExpectedSource -and $release.tag_name -eq $Tag -and $provenance.tag -eq $Tag -and $provenance.sourceCommit -eq $ExpectedSource) 'RELEASE_IDENTITY_MISMATCH'
$expected=@($provenance.assets.name)+@('build-provenance.json')
Require ($expected.Count -eq 4 -and @($expected | Sort-Object -Unique).Count -eq 4 -and 'MaterialFileEncryptor-Setup.exe' -cin $expected -and 'RELEASES' -cin $expected -and "MaterialFileEncryptor-$($sourcePackage.version)-full.nupkg" -cin $expected) 'EXPECTED_RELEASE_ASSETS_REQUIRED'
Require ($expected.Count -eq @($release.assets).Count) 'RELEASE_ASSET_COUNT_MISMATCH'
$verified=@()
foreach($name in $expected){
 Require ($name -match '^[A-Za-z0-9_.-]+$' -and !$name.Contains('..')) 'UNSAFE_ASSET_NAME'
 $asset=@($release.assets|Where-Object name -CEQ $name);Require ($asset.Count -eq 1) 'ASSET_IDENTITY_MISMATCH'
 $file=Join-Path $download $name;Require (Test-Path -LiteralPath $file -PathType Leaf) 'ASSET_MISSING'
 Require ((Get-Item -LiteralPath $file).Length -eq $asset[0].size) 'ASSET_SIZE_MISMATCH'
 $sha=Digest $file
 Require ($asset[0].digest -eq ('sha256:'+$sha)) 'HOSTED_ASSET_DIGEST_MISMATCH'
 if($name -ne 'build-provenance.json'){$record=@($provenance.assets|Where-Object name -CEQ $name);Require ($record.Count -eq 1 -and $record[0].sha256 -eq $sha -and $record[0].bytes -eq $asset[0].size) 'PROVENANCE_ASSET_MISMATCH'}
 $verified+=@{name=$name;bytes=$asset[0].size;sha256=$sha;hostedDigestPresent=[bool]$asset[0].digest}
}
$out=Join-Path $target 'out';$packages=Join-Path $out 'make/squirrel.windows/x64';$payload=Join-Path $out 'material-file-encryptor-win32-x64';$evidence=Join-Path $out 'evidence'
Require (!(Test-Path -LiteralPath $packages) -and !(Test-Path -LiteralPath $payload) -and !(Test-Path -LiteralPath $evidence)) 'TARGET_OUTPUT_ALREADY_EXISTS'
New-Item -ItemType Directory -Path $packages,$payload,$evidence -Force|Out-Null
foreach($name in $expected){if($name -ne 'build-provenance.json'){Copy-Item -LiteralPath (Join-Path $download $name) -Destination (Join-Path $packages $name)}}
$full=@(Get-ChildItem -LiteralPath $packages -Filter '*-full.nupkg' -File);Require ($full.Count -eq 1) 'EXPECTED_ONE_FULL_PACKAGE'
Set-Location $target
& scripts/package-integrity.ps1 -Packages @((Get-ChildItem -LiteralPath $packages -Filter '*.nupkg' -File).FullName)
Require ($LASTEXITCODE -eq 0) 'ARCHIVE_INTEGRITY_FAILED'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($full[0].FullName);$seen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase);$extracted=@()
try{foreach($entry in $zip.Entries){
 $name=[Uri]::UnescapeDataString($entry.FullName).Replace('\','/')
 Require (!$name.StartsWith('/') -and !$name.Contains(':') -and $name -notmatch '(^|/)\.\.(/|$)' -and !$name.Contains([char]0)) 'UNSAFE_ARCHIVE_PATH'
 Require ((($entry.ExternalAttributes -shr 16) -band 0xF000) -ne 0xA000) 'ARCHIVE_SYMLINK_REFUSED'
 if(!$name.StartsWith('lib/net45/') -or $name.EndsWith('/')){continue}
 $relative=$name.Substring('lib/net45/'.Length);Require ($relative.Length -gt 0 -and $seen.Add($relative)) 'DUPLICATE_PAYLOAD_PATH'
 foreach($part in $relative.Split('/')){Require ($part -ne '' -and $part -ne '.' -and $part.IndexOfAny([IO.Path]::GetInvalidFileNameChars()) -lt 0) 'INVALID_PAYLOAD_COMPONENT'}
 $file=[IO.Path]::GetFullPath((Join-Path $payload $relative));Require ($file.StartsWith($payload+'\',[StringComparison]::OrdinalIgnoreCase)) 'PAYLOAD_PATH_ESCAPE'
 $parent=[IO.Path]::GetDirectoryName($file);[IO.Directory]::CreateDirectory($parent)|Out-Null
 $entryStream=$entry.Open();$output=[IO.File]::Open($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write)
 try{$entryStream.CopyTo($output)}finally{$output.Dispose();$entryStream.Dispose()}
 Require ((Get-Item -LiteralPath $file).Length -eq $entry.Length) 'EXTRACTED_SIZE_MISMATCH'
 $extracted+=@{path=$relative;bytes=$entry.Length;sha256=Digest $file}
}}finally{$zip.Dispose()}
Require (Test-Path -LiteralPath (Join-Path $payload 'MaterialFileEncryptor.exe')) 'APPLICATION_PAYLOAD_MISSING'
Require (Test-Path -LiteralPath (Join-Path $payload 'resources/app.asar')) 'ASAR_PAYLOAD_MISSING'
@{version=1;sourceCommit=$ExpectedSource;verifierCommit=(& git -C $target rev-parse HEAD).Trim();tag=$Tag;preparedAtUtc=[DateTime]::UtcNow.ToString('o');buildProvenanceSha256=Digest (Join-Path $download 'build-provenance.json');assets=$verified;extractedEntries=$extracted.Count;files=$extracted;runtimeVerification='pending';installerVerification='pending'}|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 (Join-Path $evidence 'download-preparation.json')
Write-Host ('Verified '+$verified.Count+' downloaded assets and extracted '+$extracted.Count+' real payload files. Runtime and installation remain pending.')


