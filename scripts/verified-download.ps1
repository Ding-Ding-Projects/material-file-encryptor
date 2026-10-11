function Assert-BootstrapPath([string]$path) {
  $current = [IO.Path]::GetFullPath($path)
  while ($current) {
    try { $attributes = [IO.File]::GetAttributes($current) }
    catch [IO.FileNotFoundException] { $attributes = $null }
    catch [IO.DirectoryNotFoundException] { $attributes = $null }
    if ($null -ne $attributes -and ($attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Dependency paths must not contain links or reparse points.' }
    $next = [IO.Path]::GetDirectoryName($current)
    if ($next -eq $current) { break }
    $current = $next
  }
}
function Get-BootstrapDigest([string]$filename, [string]$algorithm = 'SHA256') {
  Assert-BootstrapPath $filename
  $stream = [IO.File]::OpenRead($filename)
  $hasher = if ($algorithm -eq 'SHA512') { [Security.Cryptography.SHA512]::Create() } else { [Security.Cryptography.SHA256]::Create() }
  try { return ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
  finally { $hasher.Dispose(); $stream.Dispose() }
}

function Get-Verified($entry, [string]$file, [scriptblock]$transport = $null) {
  $algorithm = if ($entry.sha512) { 'SHA512' } else { 'SHA256' }
  $expected = if ($entry.sha512) { [string]$entry.sha512 } else { [string]$entry.sha256 }
  if ($expected -notmatch $(if ($algorithm -eq 'SHA512') { '^[a-fA-F0-9]{128}$' } else { '^[a-fA-F0-9]{64}$' })) { throw 'Invalid pinned dependency digest.' }
  $file = [IO.Path]::GetFullPath($file)
  $parent = Split-Path $file -Parent
  $evidence = Join-Path $parent 'download-evidence'
  Assert-BootstrapPath $file
  Assert-BootstrapPath $evidence
  if (!(Test-Path -LiteralPath $parent -PathType Container)) { throw 'Dependency cache directory is unavailable.' }
  if ((Test-Path -LiteralPath $file -PathType Leaf) -and (Get-BootstrapDigest $file $algorithm) -eq $expected) { return }
  $sources = @($entry.url) + @($entry.fallbackUrls) | Where-Object { $_ } | Select-Object -Unique
  foreach ($source in $sources) {
    $uri = [Uri]$source
    if (!$uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) { throw 'Invalid declared dependency source.' }
  }
  $evidence = Join-Path $parent 'download-evidence'
  New-Item -ItemType Directory -Force -Path $evidence | Out-Null
  function Save-Rejected([string]$path, [string]$source, $status, [string]$outcome) {
    Assert-BootstrapPath $path
    Assert-BootstrapPath $evidence
    $id = [Guid]::NewGuid().ToString('N')
    $length = $null; $digest = $null; $quarantine = $null
    if (Test-Path -LiteralPath $path -PathType Leaf) {
      $length = (Get-Item -LiteralPath $path).Length
      $digest = Get-BootstrapDigest $path $algorithm
      $quarantine = "$id.bin"
    }
    Assert-BootstrapPath (Join-Path $evidence "$id.json")
    if ($quarantine) { Assert-BootstrapPath (Join-Path $evidence $quarantine) }
    # Never retain response bodies, headers, exception messages or credentials in receipts.
    @{ schemaVersion=1; source=$source; status=$status; length=$length; algorithm=$algorithm; actualDigest=$digest; expectedDigest=$expected; outcome=$outcome; quarantine=$quarantine; recordedAt=[DateTime]::UtcNow.ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidence "$id.json") -Encoding UTF8
    if ($quarantine) { [IO.File]::Move($path, (Join-Path $evidence $quarantine)) }
  }
  if (Test-Path -LiteralPath $file -PathType Leaf) {
    # Claim the current entry before revalidation; the earlier digest may describe a replaced file.
    $claim = Join-Path $parent ('.cache-claim-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    Assert-BootstrapPath $file
    Assert-BootstrapPath $claim
    [IO.File]::Move($file, $claim)
    if ((Get-BootstrapDigest $claim $algorithm) -eq $expected) {
      Assert-BootstrapPath $file
      [IO.File]::Move($claim, $file)
      return
    }
    Save-Rejected $claim $null $null 'invalid-cache'
  }
  foreach ($source in $sources) {
    $temporary = Join-Path $parent ('.download-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    Assert-BootstrapPath $temporary
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $status = $null; $transportFailed = $false
    try {
      if ($transport) { $status = & $transport $source $stream 120 }
      else {
        Add-Type -AssemblyName System.Net.Http
        $handler = New-Object System.Net.Http.HttpClientHandler
        $handler.AllowAutoRedirect = $false
        $client = New-Object System.Net.Http.HttpClient($handler)
        $client.Timeout = [TimeSpan]::FromSeconds(120)
        $response = $null; $body = $null; $deadline = New-Object System.Threading.CancellationTokenSource; $deadline.CancelAfter(120000)
        try {
          $current = [Uri]$source
          for ($redirect = 0; $redirect -le 5; $redirect++) {
            $response = $client.GetAsync($current, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead, $deadline.Token).GetAwaiter().GetResult()
            if ([int]$response.StatusCode -notin @(301,302,303,307,308)) { break }
            if ($redirect -eq 5 -or !$response.Headers.Location) { throw 'Dependency redirect limit exceeded.' }
            $next = New-Object Uri($current, $response.Headers.Location)
            if ($next.Scheme -ne 'https' -or $next.UserInfo) { throw 'Unsafe dependency redirect.' }
            $response.Dispose(); $response = $null; $current = $next
          }
          $status = [int]$response.StatusCode
          $body = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult(); $body.CopyToAsync($stream, 81920, $deadline.Token).GetAwaiter().GetResult()
        } finally { if ($body) { $body.Dispose() }; if ($response) { $response.Dispose() }; $deadline.Dispose(); $client.Dispose(); $handler.Dispose() }
      }
    } catch { $transportFailed = $true }
    finally { $stream.Dispose() }
    if (!$transportFailed -and $status -eq 200 -and (Get-BootstrapDigest $temporary $algorithm) -eq $expected) {
      # Move without overwrite is atomic on this volume and preserves a concurrent cache publisher.
      Assert-BootstrapPath $temporary
      Assert-BootstrapPath $file
      try { [IO.File]::Move($temporary, $file); return }
      catch {
        if ((Test-Path -LiteralPath $file -PathType Leaf) -and (Get-BootstrapDigest $file $algorithm) -eq $expected) { Remove-Item -LiteralPath $temporary; return }
        Save-Rejected $temporary $source $status 'publication-conflict'
        throw 'Dependency cache publication conflict; evidence retained.'
      }
    }
    Save-Rejected $temporary $source $status $(if ($transportFailed) { 'transport-failure' } else { 'invalid-download' })
  }
  throw 'All declared dependency sources failed verification; evidence retained.'
}
