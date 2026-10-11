function Get-SquirrelFileHash {
  param([Parameter(Mandatory, Position=0)][string]$LiteralPath,
    [ValidateSet('SHA1','SHA256')][string]$Algorithm = 'SHA256')
  # Use the same framework digest route as bootstrap and package integrity.
  # Child Windows PowerShell hosts do not always expose the Utility hash command.
  $inputStream = [IO.File]::OpenRead([IO.Path]::GetFullPath($LiteralPath))
  $hasher = [Security.Cryptography.HashAlgorithm]::Create($Algorithm)
  try { return [pscustomobject]@{Hash=([BitConverter]::ToString($hasher.ComputeHash($inputStream))).Replace('-','');Algorithm=$Algorithm} }
  finally { $hasher.Dispose(); $inputStream.Dispose() }
}
