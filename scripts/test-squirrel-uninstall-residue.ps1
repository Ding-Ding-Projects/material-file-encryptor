$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\squirrel-uninstall-residue.ps1"
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('mfe-residue-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $fixture | Out-Null
$links = @(); $checks = 0
function Create-Fixture([string]$Name, [switch]$Updater, [switch]$Application) {
    $path = Join-Path $fixture $Name; New-Item -ItemType Directory $path | Out-Null
    [IO.File]::WriteAllBytes((Join-Path $path '.dead'), [byte[]]@(32))
    if ($Updater) { [IO.File]::WriteAllBytes((Join-Path $path 'Update.exe'), [byte[]]@(1,2,3)) }
    if ($Application) { New-Item -ItemType Directory (Join-Path $path 'app-0.1.0') | Out-Null; [IO.File]::WriteAllBytes((Join-Path $path 'app-0.1.0\squirrel.exe'), [byte[]]@(1,2,3)) }
    return $path
}
function Check-Case([string]$Name, [string]$Path, [bool]$Expected, [string]$Code) {
    $result = Get-SquirrelUninstallResidue $Path '0.1.0' $digest
    if ($result.applicationPayloadRemoved -ne $Expected -or ($Code -and $result.failureCode -ne $Code)) { throw "Residue case failed: $Name" }
    if ($Expected -and $Name -eq 'both helpers') {
        if ($result.applicationDirectoriesRemoved -or @($result.residue | Where-Object { $_.relativePath -match '(?i)(update|squirrel)\.exe$' -and $_.sha256 -eq $digest }).Count -ne 2) { throw 'Helper residue hash/directory evidence missing.' }
    }
    $script:checks++; Write-Host "PASS $Name"
}
try {
    $reference = Create-Fixture 'both' -Updater -Application; $digest = Get-SquirrelResidueDigest (Join-Path $reference 'Update.exe')
    Check-Case 'both helpers' $reference $true ''
    Check-Case 'absent root' (Join-Path $fixture 'absent') $true ''
    $empty = Join-Path $fixture 'empty'; New-Item -ItemType Directory $empty | Out-Null; Check-Case 'empty root' $empty $true ''
    Check-Case 'marker only' (Create-Fixture 'marker') $true ''
    Check-Case 'root helper only' (Create-Fixture 'root-helper' -Updater) $true ''
    Check-Case 'version helper only' (Create-Fixture 'version-helper' -Application) $true ''
    $wrong = Create-Fixture 'wrong-root' -Updater; [IO.File]::WriteAllBytes((Join-Path $wrong 'Update.exe'), [byte[]]@(4)); Check-Case 'wrong root helper hash' $wrong $false 'UNINSTALL_UPDATER_MISMATCH'
    $wrong = Create-Fixture 'wrong-version' -Application; [IO.File]::WriteAllBytes((Join-Path $wrong 'app-0.1.0\squirrel.exe'), [byte[]]@(4)); Check-Case 'wrong version helper hash' $wrong $false 'UNINSTALL_UPDATER_MISMATCH'
    $extra = Create-Fixture 'extra' -Application; [IO.File]::WriteAllBytes((Join-Path $extra 'app-0.1.0\MaterialFileEncryptor.exe'), [byte[]]@(1)); Check-Case 'extra product executable' $extra $false 'UNINSTALL_APPLICATION_RESIDUE'
    $nested = Create-Fixture 'nested' -Application; New-Item -ItemType Directory (Join-Path $nested 'app-0.1.0\data') | Out-Null; Check-Case 'nested data' $nested $false 'UNINSTALL_APPLICATION_RESIDUE'
    $unexpected = Create-Fixture 'unexpected'; [IO.File]::WriteAllBytes((Join-Path $unexpected 'unknown.log'), [byte[]]@(1)); Check-Case 'unexpected root file' $unexpected $false 'UNINSTALL_UNEXPECTED_ENTRY'
    $wrongVersion = Create-Fixture 'wrong-app' -Application; Rename-Item -LiteralPath (Join-Path $wrongVersion 'app-0.1.0') -NewName 'app-0.2.0'; Check-Case 'wrong version directory' $wrongVersion $false 'UNINSTALL_UNEXPECTED_ENTRY'
    $badMarker = Create-Fixture 'bad-marker'; [IO.File]::WriteAllBytes((Join-Path $badMarker '.dead'), [byte[]]@(0)); Check-Case 'wrong marker' $badMarker $false 'UNINSTALL_MARKER_MISMATCH'
    $noMarker = Create-Fixture 'no-marker' -Updater; Remove-Item -LiteralPath (Join-Path $noMarker '.dead'); Check-Case 'missing helper marker' $noMarker $false 'UNINSTALL_MARKER_MISSING'
    $junction = Create-Fixture 'junction'; $link = Join-Path $junction 'app-0.1.0'; New-Item -ItemType Junction -Path $link -Target $reference | Out-Null; $links += $link; Check-Case 'version reparse path' $junction $false 'UNINSTALL_REPARSE_PATH'
    $rootLink = Join-Path $fixture 'root-link'; New-Item -ItemType Junction -Path $rootLink -Target $reference | Out-Null; $links += $rootLink; Check-Case 'root reparse path' $rootLink $false 'UNINSTALL_REPARSE_PATH'
    $childLink = Create-Fixture 'child-link'; New-Item -ItemType Directory (Join-Path $childLink 'app-0.1.0') | Out-Null; $link = Join-Path $childLink 'app-0.1.0\squirrel.exe'; New-Item -ItemType Junction -Path $link -Target $reference | Out-Null; $links += $link; Check-Case 'child reparse path' $childLink $false 'UNINSTALL_REPARSE_PATH'
    Write-Host "Squirrel residue regression: $checks checks passed."
} finally {
    foreach ($link in $links) { if (Test-Path -LiteralPath $link) { [IO.Directory]::Delete($link) } }
    $resolved = [IO.Path]::GetFullPath($fixture); $parent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    if (!$resolved.StartsWith($parent + '\', [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -notlike 'mfe-residue-test-*') { throw 'Unsafe test cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
