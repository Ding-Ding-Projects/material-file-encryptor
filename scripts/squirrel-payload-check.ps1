param([Parameter(Mandatory)][string]$Package, [Parameter(Mandatory)][string]$Updater,
  [string]$ExpectedVersion, [string]$ExpectedSource, [string]$ReceiptPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$packagePath = [IO.Path]::GetFullPath($Package)
# Validate all paths before allowing the native extractor to write any entry.
$preflight = [IO.Compression.ZipFile]::OpenRead($packagePath)
try {
  $seen = New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  foreach ($entry in $preflight.Entries) {
    $name = $entry.FullName.Replace('\','/')
    if ($name.StartsWith('/') -or $name.Contains(':') -or $name -match '(^|/)\.\.(/|$)' -or !$seen.Add($name)) { throw 'UNSAFE_PACKAGE_PATH' }
  }
} finally { $preflight.Dispose() }
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('mfe-squirrel-extract-' + [Guid]::NewGuid().ToString('N'))
$payload = Join-Path $scratch 'app'; $stubRoot = Join-Path $scratch 'root'
New-Item -ItemType Directory $payload,$stubRoot | Out-Null
$assembly = [Reflection.Assembly]::LoadFrom([IO.Path]::GetFullPath($Updater))
$method = @($assembly.GetType('Squirrel.ReleasePackage').GetMethods() | Where-Object { $_.Name -eq 'ExtractZipForInstall' -and $_.GetParameters().Count -eq 3 })[0]
$arguments = New-Object 'Object[]' 3
$arguments[0] = [IO.Path]::GetFullPath($Package)
$arguments[1] = $payload.PSObject.BaseObject
$arguments[2] = $stubRoot.PSObject.BaseObject
$task = $method.Invoke($null, $arguments)
$task.GetAwaiter().GetResult() | Out-Null
$zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Package))
$matched = 0
try {
  foreach ($entry in $zip.Entries) {
    $name = $entry.FullName.Replace('\','/')
    if (!$name.StartsWith('lib/net45/') -or $name.EndsWith('/')) { continue }
    $relative = $name.Substring(10)
    if ($relative -match '(^|/)\.\.(/|$)' -or $relative.Contains(':')) { throw 'UNSAFE_PACKAGE_PATH' }
    $file = if ($relative.Contains('_ExecutionStub.exe')) { Join-Path $stubRoot ([IO.Path]::GetFileName($relative).Replace('_ExecutionStub.exe','.exe')) } else { Join-Path $payload $relative }
    if (!(Test-Path -LiteralPath $file -PathType Leaf) -or (Get-Item -LiteralPath $file).Length -ne $entry.Length) { throw "SQUIRREL_EXTRACTED_FILE_MISMATCH: $relative" }
    $stream = $entry.Open(); $hash = [Security.Cryptography.SHA256]::Create()
    try { $expectedHash = ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-','') } finally { $stream.Dispose(); $hash.Dispose() }
    if ((Get-FileHash -LiteralPath $file).Hash -ne $expectedHash) { throw "SQUIRREL_EXTRACTED_HASH_MISMATCH: $relative" }
    $matched++
  }
  if ($ExpectedVersion) {
    $spec = @($zip.Entries | Where-Object FullName -Match '^[^/]+\.nuspec$')
    if ($spec.Count -ne 1) { throw 'PACKAGE_SPEC_REQUIRED' }
    $reader = [IO.StreamReader]::new($spec[0].Open())
    try { [xml]$xml = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($xml.package.metadata.version -ne $ExpectedVersion) { throw 'PACKAGE_SPEC_VERSION_MISMATCH' }
    $asar = Join-Path $payload 'resources/app.asar'
    $inspect = & node -e "const a=require('@electron/asar'); const p=process.argv[1]; const read=n=>JSON.parse(a.extractFile(p,n)); console.log(JSON.stringify({manifest:read('package.json'),build:read('src/shared/build-metadata.json')}))" $asar
    if ($LASTEXITCODE -ne 0) { throw 'PACKAGE_MANIFEST_UNREADABLE' }
    $embedded = $inspect | ConvertFrom-Json
    if ($embedded.manifest.version -ne $ExpectedVersion -or $embedded.build.version -ne $ExpectedVersion -or ($ExpectedSource -and $embedded.build.sourceCommit -ne $ExpectedSource)) { throw 'PACKAGE_VERSION_OR_SOURCE_MISMATCH' }
  }
} finally { $zip.Dispose() }
if ($matched -eq 0) { throw 'EMPTY_PACKAGE_PAYLOAD' }
$receipt = @{schemaVersion=1; packageSha256=(Get-FileHash $Package).Hash.ToLowerInvariant(); updaterSha256=(Get-FileHash $Updater).Hash.ToLowerInvariant(); matchedFiles=$matched; passed=$true; installedLifecycleVerified=$false; retainedExtraction=$scratch}
if ($ReceiptPath) { $receipt | ConvertTo-Json | Set-Content -LiteralPath $ReceiptPath -Encoding UTF8 }
Write-Host "Squirrel extractor matched all $matched payload files. Installed lifecycle remains separate."
