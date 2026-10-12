$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$publisher=Join-Path $root '.github/scripts/publish-preview.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($publisher,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'PUBLISHER_PARSE_FAILED'}
$functions=@($ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Resolve-PublicReleasePhoto'},$true))
if($functions.Count -ne 1){throw 'PHOTO_RESOLVER_REQUIRED'}
. ([scriptblock]::Create($functions[0].Extent.Text))
function Assert([bool]$condition,[string]$message){if(!$condition){throw $message}}
function Gh([string[]]$Arguments){
 $script:calls+=,@($Arguments)
 if($Arguments[0] -ne 'api'){throw 'METADATA_ONLY_REQUIRED'}
 if($Arguments[1] -like '*/commits/main'){return '{"sha":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}'}
 if($Arguments[1] -like '*/contents/*'){
  if($Arguments[1] -notlike '*ref=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'){throw 'PINNED_CATALOG_REQUIRED'}
  return '{"dishes":[{"id":"hk-dish-0001","name":{"en":"Synthetic dish","zhHant":"測試"},"image":{"path":"images/sample.png"}}]}'
 }
 if($Arguments[1] -like '*/releases?*'){return ConvertTo-Json -InputObject @($script:release) -Depth 8 -Compress}
 throw 'UNEXPECTED_METADATA_ROUTE'
}
function Reset-Fixture {
 $script:calls=@()
 $script:release=@{tag_name='catalog-v1';draft=$false;prerelease=$false;assets=@(@{name='sample.png';state='uploaded';size=100;digest=('sha256:'+('b'*64));browser_download_url='https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/sample.png'})}
}
Reset-Fixture
$reference=Resolve-PublicReleasePhoto
Assert ($reference.catalogRevision -eq ('a'*40) -and $reference.nameEnglish -eq 'Synthetic dish' -and $reference.url -eq $release.assets[0].browser_download_url) 'PUBLIC_REFERENCE_INVALID'
Assert ($calls.Count -eq 3) 'METADATA_CALL_COUNT_INVALID'
$count=1
foreach($mutation in @('draft','prerelease','wrong-tag','wrong-url','missing-digest','unpublished')){
 Reset-Fixture
 switch($mutation){
  draft{$release.draft=$true}
  prerelease{$release.prerelease=$true}
  wrong-tag{$release.tag_name='images-v1'}
  wrong-url{$release.assets[0].browser_download_url='https://example.com/sample.png'}
  missing-digest{$release.assets[0].digest=$null}
  unpublished{$release.assets[0].state='new'}
 }
 $rejected=$false;try{$null=Resolve-PublicReleasePhoto}catch{if($_.Exception.Message -ne 'PUBLIC_CATALOG_IMAGE_REQUIRED'){throw};$rejected=$true}
 Assert $rejected "PUBLIC_REFERENCE_MUTATION_ACCEPTED:$mutation"
 $count++
}
$source=Get-Content -LiteralPath $publisher -Raw
Assert (!$source.Contains('docs/release-assets') -and !$source.Contains('$imagePath') -and !$source.Contains('Drawing.Image')) 'CONSUMER_PHOTO_COPY_REINTRODUCED'
Assert ($source.Contains('$assets=@($setup,$releases)+@($packages.FullName)')) 'PACKAGE_ASSETS_CHANGED'
$count++
Write-Host "Release photo reference regression: $count checks passed; no publication or photo download executed."
