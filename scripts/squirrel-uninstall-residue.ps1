function Get-SquirrelResidueDigest([string]$Path) {
    $stream = [IO.File]::OpenRead($Path); $hasher = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hasher.Dispose(); $stream.Dispose() }
}

function Get-SquirrelUninstallResidue([string]$Root, [string]$ExpectedVersion, [string]$UpdaterSha256) {
    if (![IO.Path]::IsPathRooted($Root) -or $ExpectedVersion -notmatch '^[0-9][0-9A-Za-z.+-]*$' -or $UpdaterSha256 -notmatch '^[a-f0-9]{64}$') { throw 'INVALID_RESIDUE_INPUT' }
    $resolved = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
    $result = [ordered]@{ schemaVersion = 1; applicationPayloadRemoved = $false; applicationDirectoriesRemoved = $false; classification = 'unexpected-residue'; failureCode = $null; residue = @() }
    # Never follow a root or ancestor reparse point, even when the leaf is absent.
    $ancestor = $resolved
    while ($ancestor) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force -ErrorAction Stop
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { $result.failureCode = 'UNINSTALL_REPARSE_PATH'; return [pscustomobject]$result }
        }
        $parent = [IO.Path]::GetDirectoryName($ancestor)
        if ($parent -eq $ancestor) { break }; $ancestor = $parent
    }
    if (!(Test-Path -LiteralPath $resolved)) {
        $result.applicationPayloadRemoved = $true; $result.applicationDirectoriesRemoved = $true; $result.classification = 'absent'; return [pscustomobject]$result
    }
    if (!(Test-Path -LiteralPath $resolved -PathType Container)) { $result.failureCode = 'UNINSTALL_ROOT_NOT_DIRECTORY'; return [pscustomobject]$result }
    $entries = @(Get-ChildItem -LiteralPath $resolved -Force -ErrorAction Stop)
    $result.applicationDirectoriesRemoved = @($entries | Where-Object { $_.PSIsContainer -and $_.Name.StartsWith('app-', [StringComparison]::OrdinalIgnoreCase) }).Count -eq 0
    $hasMarker = $false; $hasUpdater = $false
    foreach ($entry in $entries) {
        $row = [pscustomobject][ordered]@{ relativePath = $entry.Name; directory = $entry.PSIsContainer; bytes = if ($entry.PSIsContainer) { 0 } else { $entry.Length }; sha256 = $null }
        $result.residue += $row
        if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { $result.failureCode = 'UNINSTALL_REPARSE_PATH'; return [pscustomobject]$result }
        if (!$entry.PSIsContainer -and $entry.Name -ceq '.dead') {
            $marker = [IO.File]::ReadAllBytes($entry.FullName)
            if ($marker.Length -ne 1 -or $marker[0] -ne 32) { $result.failureCode = 'UNINSTALL_MARKER_MISMATCH'; return [pscustomobject]$result }
            $row.sha256 = Get-SquirrelResidueDigest $entry.FullName; $hasMarker = $true
        } elseif (!$entry.PSIsContainer -and $entry.Name -ieq 'Update.exe') {
            $row.sha256 = Get-SquirrelResidueDigest $entry.FullName
            if ($row.sha256 -ne $UpdaterSha256) { $result.failureCode = 'UNINSTALL_UPDATER_MISMATCH'; return [pscustomobject]$result }; $hasUpdater = $true
        } elseif ($entry.PSIsContainer -and $entry.Name -ceq "app-$ExpectedVersion") {
            $children = @(Get-ChildItem -LiteralPath $entry.FullName -Force -ErrorAction Stop)
            if ($children.Count -ne 1) { $result.failureCode = 'UNINSTALL_APPLICATION_RESIDUE'; return [pscustomobject]$result }
            $child = $children[0]
            $childRow = [pscustomobject][ordered]@{ relativePath = $entry.Name + '/' + $child.Name; directory = $child.PSIsContainer; bytes = if ($child.PSIsContainer) { 0 } else { $child.Length }; sha256 = $null }
            $result.residue += $childRow
            if ($child.Attributes -band [IO.FileAttributes]::ReparsePoint) { $result.failureCode = 'UNINSTALL_REPARSE_PATH'; return [pscustomobject]$result }
            if ($child.PSIsContainer -or $child.Name -ine 'squirrel.exe') { $result.failureCode = 'UNINSTALL_APPLICATION_RESIDUE'; return [pscustomobject]$result }
            $childRow.sha256 = Get-SquirrelResidueDigest $child.FullName
            if ($childRow.sha256 -ne $UpdaterSha256) { $result.failureCode = 'UNINSTALL_UPDATER_MISMATCH'; return [pscustomobject]$result }; $hasUpdater = $true
        } else { $result.failureCode = 'UNINSTALL_UNEXPECTED_ENTRY'; return [pscustomobject]$result }
    }
    if ($hasUpdater -and !$hasMarker) { $result.failureCode = 'UNINSTALL_MARKER_MISSING'; return [pscustomobject]$result }
    $result.applicationPayloadRemoved = $true
    $result.classification = if ($hasUpdater) { 'verified-updater-only' } elseif ($hasMarker) { 'documented-marker' } else { 'empty-root' }
    return [pscustomobject]$result
}
