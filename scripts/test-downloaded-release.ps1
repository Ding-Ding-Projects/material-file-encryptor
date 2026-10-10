$ErrorActionPreference = 'Stop'
$helper = Join-Path $PSScriptRoot 'prepare-downloaded-release.ps1'
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('mfe-release-test-' + [Guid]::NewGuid().ToString('N'))
$target = Join-Path $fixture 'target'
$download = Join-Path $fixture 'download'
New-Item -ItemType Directory -Path $target,$download | Out-Null
$checks = 0
try {
    & git -C $target init -q
    '{"version":"0.1.0"}' | Set-Content (Join-Path $target 'package.json')
    & git -C $target add package.json
    & git -C $target -c user.name='Claude Fable 5.1' -c user.email='noreply@anthropic.com' commit -qm "Create synthetic release fixture`n`n建立測試樣本，假資料也要排好隊。`n`nCo-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
    $sha = (& git -C $target rev-parse HEAD).Trim()
    $names = @('MaterialFileEncryptor-Setup.exe','MaterialFileEncryptor-0.1.0-full.nupkg','RELEASES')
    $records = @()
    foreach ($name in $names) {
        $file = Join-Path $download $name
        [IO.File]::WriteAllText($file, 'synthetic bytes')
        $records += @{name=$name;bytes=(Get-Item $file).Length;sha256=(Get-FileHash $file).Hash.ToLowerInvariant()}
    }
    function Reset-Metadata {
        $script:provenance = @{sourceCommit=$sha;tag='v1.1.1';packageVersion='0.1.0';assets=$records}
        $script:release = @{draft=$false;prerelease=$false;tag_name='v1.1.1';target_commitish=$sha;assets=@()}
    }
    function Save-Metadata {
        $provenance | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $download 'build-provenance.json')
        $release.assets = @(Get-ChildItem $download -File | ForEach-Object { @{name=$_.Name;size=$_.Length;digest=('sha256:'+(Get-FileHash $_.FullName).Hash.ToLowerInvariant())} })
    }
    function Expect-Rejection([string]$code, [scriptblock]$mutate) {
        Reset-Metadata
        & $mutate
        Save-Metadata
        if ($code -eq 'HOSTED_ASSET_DIGEST_MISMATCH') { $release.assets[0].digest='sha256:'+('0'*64) }
        if ($code -eq 'RELEASE_ASSET_COUNT_MISMATCH') { $release.assets=$release.assets[0..2] }
        $metadata=Join-Path $fixture 'release.json'
        $release | ConvertTo-Json -Depth 6 | Set-Content $metadata
        $observed=$null
        try { & $helper -DownloadedDirectory $download -TargetWorktree $target -ReleaseMetadata $metadata -Tag v1.1.1 -ExpectedSource $sha } catch { $observed=$_.Exception.Message }
        if ($observed -ne $code) { throw "Expected $code, observed $observed" }
        $script:checks++
    }
    Expect-Rejection 'RELEASE_IDENTITY_MISMATCH' { $release.prerelease=$true }
    Expect-Rejection 'RELEASE_IDENTITY_MISMATCH' { $release.draft=$true }
    Expect-Rejection 'RELEASE_IDENTITY_MISMATCH' { $provenance.sourceCommit='0'*40 }
    Expect-Rejection 'SOURCE_PACKAGE_VERSION_MISMATCH' { $provenance.packageVersion='9.9.9' }
    Expect-Rejection 'HOSTED_ASSET_DIGEST_MISMATCH' { }
    Expect-Rejection 'RELEASE_ASSET_COUNT_MISMATCH' { }
    New-Item -ItemType Directory -Path (Join-Path $target 'out/evidence') -Force | Out-Null
    Expect-Rejection 'TARGET_OUTPUT_ALREADY_EXISTS' { }
    $parseErrors=$null
    $checkerAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'windows-installer-check.ps1'),[ref]$null,[ref]$parseErrors)
    if ($parseErrors.Count) { throw 'CHECKER_PARSE_FAILED' }
    $functionAst=$checkerAst.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Assert-DownloadedSnapshotBinding'},$true)
    Invoke-Expression $functionAst.Extent.Text
    $manifest=@{commit=$sha;verifierCommit=$sha;downloadPreparationSha256=('a'*64)}
    Assert-DownloadedSnapshotBinding $manifest $sha $sha ('a'*64)
    $checks++
    foreach ($field in @('commit','verifierCommit','downloadPreparationSha256')) {
        $stale=$manifest.Clone();$stale[$field]='stale'
        $observed=$null
        try { Assert-DownloadedSnapshotBinding $stale $sha $sha ('a'*64) } catch { $observed=$_.Exception.Message }
        if ($observed -ne 'DOWNLOADED_SNAPSHOT_STALE') { throw 'STALE_SNAPSHOT_ACCEPTED' }
        $checks++
    }
    Write-Host "PASS: $checks downloaded release rejection checks. No installation or application launch."
} finally {
    # The random fixture is the only deletion target.
    $resolved=[IO.Path]::GetFullPath($fixture)
    if (!$resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'mfe-release-test-*') { throw 'UNSAFE_TEST_FIXTURE' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
