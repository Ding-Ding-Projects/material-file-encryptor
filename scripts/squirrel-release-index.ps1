function ConvertTo-CompatibleSquirrelReleaseIndex {
  param([Parameter(Mandatory)][string]$Index, [Parameter(Mandatory)][string]$Package)
  $raw = [IO.File]::ReadAllBytes($Index)
  if ($raw.Length -eq 0 -or $raw.Length -gt 4096) { throw 'RELEASE_INDEX_SIZE_INVALID' }
  $offset = 0
  if ($raw.Length -ge 3 -and $raw[0] -eq 239 -and $raw[1] -eq 187 -and $raw[2] -eq 191) { $offset = 3 }
  try { $text = [Text.UTF8Encoding]::new($false, $true).GetString($raw, $offset, $raw.Length - $offset) }
  catch { throw 'RELEASE_INDEX_UTF8_INVALID' }
  $match = [regex]::Match($text.Trim(), '^([a-fA-F0-9]{40}) ([A-Za-z0-9_.-]+-full\.nupkg) ([1-9][0-9]*)$')
  if (!$match.Success -or $match.Groups[2].Value -cne [IO.Path]::GetFileName($Package) -or
      $match.Groups[3].Value -cne [string](Get-Item -LiteralPath $Package).Length -or
      $match.Groups[1].Value.ToLowerInvariant() -cne (Get-SquirrelFileHash -LiteralPath $Package -Algorithm SHA1).Hash.ToLowerInvariant()) {
    throw 'RELEASE_INDEX_PACKAGE_MISMATCH'
  }
  # Change only the optional BOM, preserving the generated line bytes.
  if ($offset) {
    $normalized = New-Object byte[] ($raw.Length - $offset)
    [Array]::Copy($raw, $offset, $normalized, 0, $normalized.Length)
    [IO.File]::WriteAllBytes($Index, $normalized)
  }
}
