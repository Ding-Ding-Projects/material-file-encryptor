function ConvertTo-SquirrelZip([string]$InputPath, [string]$OutputPath) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Add-Type -AssemblyName System.IO.Compression
  $zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($InputPath))
  try {
    $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in $zip.Entries) {
      $name = $entry.FullName.Replace('\','/')
      if ($name.StartsWith('/') -or $name.Contains(':') -or $name -match '(^|/)\.\.(/|$)' -or !$seen.Add($name)) { throw 'UNSAFE_PACKAGE_PATH' }
    }
    # Unlike the archive CLI, ZipArchive preserves Deflate for incompressible
    # regular files. Squirrel cannot read stored entries with data descriptors.
    $destination = [IO.Compression.ZipFile]::Open([IO.Path]::GetFullPath($OutputPath), [IO.Compression.ZipArchiveMode]::Create)
    try {
      foreach ($entry in $zip.Entries) {
        $copy = $destination.CreateEntry($entry.FullName, [IO.Compression.CompressionLevel]::Optimal)
        $copy.LastWriteTime = $entry.LastWriteTime
        $sourceStream = $entry.Open(); $targetStream = $copy.Open()
        try { $sourceStream.CopyTo($targetStream) }
        finally { $targetStream.Dispose(); $sourceStream.Dispose() }
      }
    } finally { $destination.Dispose() }
  } finally { $zip.Dispose() }
}
