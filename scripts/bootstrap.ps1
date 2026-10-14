param([switch]$InstallDriver, [switch]$RuntimeToolsOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Avoid per-byte/per-file progress overhead in Windows PowerShell.
$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content (Join-Path $root 'dependencies.json') -Raw | ConvertFrom-Json
$tools = Join-Path $env:LOCALAPPDATA 'MaterialFileEncryptor-BuildTools'
New-Item -ItemType Directory -Force $tools | Out-Null
. (Join-Path $PSScriptRoot 'verified-download.ps1')
# Runtime tools always resolve to complete pinned portable distributions.
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Test-PortableTree([string]$archive, [string]$directory) {
  if (!(Test-Path -LiteralPath $directory -PathType Container)) { return $false }
  $zip = [IO.Compression.ZipFile]::OpenRead($archive)
  try {
    $expected = @{}
    foreach ($entry in $zip.Entries) {
      $relative = $entry.FullName.Replace('/', '\')
      if ($relative.EndsWith('\')) { continue }
      if ($relative.StartsWith('\') -or $relative.Contains(':') -or $relative -match '(^|\\)\.\.(\\|$)') { throw 'Unsafe portable tool archive entry.' }
      $path = Join-Path $directory $relative
      if (!(Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Item -LiteralPath $path).Length -ne $entry.Length) { return $false }
      $stream = $entry.Open(); $hasher = [Security.Cryptography.SHA256]::Create()
      try { $hash = ([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
      finally { $stream.Dispose(); $hasher.Dispose() }
      if ((Get-BootstrapDigest $path) -ne $hash) { return $false }
      $expected[$relative.ToLowerInvariant()] = $true
    }
    $actual = @(Get-ChildItem -LiteralPath $directory -File -Recurse)
    if ($actual.Count -ne $expected.Count) { return $false }
    foreach ($file in $actual) { if (!$expected.ContainsKey($file.FullName.Substring($directory.Length + 1).ToLowerInvariant())) { return $false } }
    return $expected.Count -gt 0
  } finally { $zip.Dispose() }
}
function Activate-PortableTool([string]$name, $entry) {
  $archive = Join-Path $tools "$name-$($entry.version).zip"
  Get-Verified $entry $archive
  $directory = Join-Path $tools "$name-$($entry.version)"
  if (!(Test-PortableTree $archive $directory)) {
    $stage = $directory + '.stage-' + [Guid]::NewGuid().ToString('N')
    Expand-Archive -LiteralPath $archive -DestinationPath $stage
    if (!(Test-PortableTree $archive $stage)) { throw "Portable $name extraction validation failed; previous cache retained." }
    if (Test-Path -LiteralPath $directory) { Move-Item -LiteralPath $directory -Destination ($directory + '.previous-' + [Guid]::NewGuid().ToString('N')) }
    Move-Item -LiteralPath $stage -Destination $directory
  }
  return $directory
}
$gitPortable = Activate-PortableTool 'git' $manifest.git
$ghPortable = Activate-PortableTool 'gh' $manifest.gh
$env:MFE_GIT_EXECUTABLE = Join-Path $gitPortable 'cmd\git.exe'
$env:MFE_GH_EXECUTABLE = Join-Path $ghPortable 'bin\gh.exe'
$gitVersion = & $env:MFE_GIT_EXECUTABLE --version
if ($LASTEXITCODE -ne 0 -or $gitVersion -ne "git version $($manifest.git.version)") { throw 'Pinned portable Git version mismatch.' }
$ghVersion = @(& $env:MFE_GH_EXECUTABLE --version)[0]
if ($LASTEXITCODE -ne 0 -or $ghVersion -notmatch ('^gh version ' + [regex]::Escape($manifest.gh.version) + '( |$)')) { throw 'Pinned portable GitHub CLI version mismatch.' }
$env:MFE_GIT_TOOL_ROOT = $gitPortable
$env:MFE_GH_TOOL_ROOT = $ghPortable
$env:PATH = "$(Split-Path $env:MFE_GIT_EXECUTABLE);$(Split-Path $env:MFE_GH_EXECUTABLE);$env:PATH"
Write-Host "Verified portable $gitVersion and $ghVersion. No administrator rights required."
if ($RuntimeToolsOnly) { return }
$sevenZipArchive = Join-Path $tools "7zip-$($manifest.sevenZip.version).7z"
Get-Verified $manifest.sevenZip $sevenZipArchive
$sevenZipExtractor = Join-Path $tools "7zr-$($manifest.sevenZip.version).exe"
Get-Verified @{ version = $manifest.sevenZip.version; url = $manifest.sevenZip.extractorUrl; sha256 = $manifest.sevenZip.extractorSha256 } $sevenZipExtractor
$sevenZipRoot = Join-Path $tools "7zip-$($manifest.sevenZip.version)"
$sevenZipExecutable = Join-Path $sevenZipRoot $manifest.sevenZip.executable
if (!(Test-Path -LiteralPath $sevenZipExecutable) -or (Get-BootstrapDigest $sevenZipExecutable) -ne $manifest.sevenZip.executableSha256) {
  $sevenZipStage = $sevenZipRoot + '.stage-' + [Guid]::NewGuid().ToString('N')
  & $sevenZipExtractor x $sevenZipArchive "-o$sevenZipStage" -y
  if ($LASTEXITCODE -ne 0 -or (Get-BootstrapDigest (Join-Path $sevenZipStage $manifest.sevenZip.executable)) -ne $manifest.sevenZip.executableSha256) { throw 'Pinned 7-Zip extraction failed.' }
  if (Test-Path -LiteralPath $sevenZipRoot) { Move-Item -LiteralPath $sevenZipRoot -Destination ($sevenZipRoot + '.previous-' + [Guid]::NewGuid().ToString('N')) }
  Move-Item -LiteralPath $sevenZipStage -Destination $sevenZipRoot
}
$env:MFE_ARCHIVE_EXECUTABLE = $sevenZipExecutable
$nugetExecutable = Join-Path $tools "nuget-$($manifest.nuget.version).exe"
Get-Verified $manifest.nuget $nugetExecutable
if ((Get-Item -LiteralPath $nugetExecutable).VersionInfo.FileVersion -ne $manifest.nuget.fileVersion) { throw 'Pinned NuGet version mismatch.' }
$env:MFE_NUGET_EXECUTABLE = $nugetExecutable
$nodeArchive = Join-Path $tools "node-$($manifest.node.version).zip"
Get-Verified $manifest.node $nodeArchive
$node = Join-Path $tools "node-v$($manifest.node.version)-win-x64"
if (!(Test-Path (Join-Path $node 'node.exe'))) { Write-Host 'Extracting Node.'; Expand-Archive $nodeArchive $tools -Force }
$dotnetArchive = Join-Path $tools "dotnet-$($manifest.dotnet.version).zip"
Get-Verified $manifest.dotnet $dotnetArchive
# Build-time native Node modules import VCRUNTIME140.dll. A fresh Windows
# installation may not have the Visual C++ runtime, so place one verified,
# Microsoft-signed copy next to the pinned node.exe instead of requiring an
# elevated system-wide installation. An existing system runtime is used as is.
if (!(Test-Path -LiteralPath (Join-Path $env:SystemRoot "System32\$($manifest.vcRuntime.member)")) -and !(Test-Path -LiteralPath (Join-Path $node $manifest.vcRuntime.member))) {
  Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
  $runtimeArchive = Join-Path $tools "vc-runtime-$($manifest.vcRuntime.version).zip"
  Get-Verified $manifest.vcRuntime $runtimeArchive
  $runtimeStage = Join-Path $tools ('vc-runtime.stage-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory $runtimeStage | Out-Null
  try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($runtimeArchive)
    try {
      $member = @($zip.Entries | Where-Object { $_.FullName -ceq $manifest.vcRuntime.member })
      if ($member.Count -ne 1) { throw 'Pinned Visual C++ runtime archive does not contain exactly one runtime library.' }
      $staged = Join-Path $runtimeStage $manifest.vcRuntime.member
      [IO.Compression.ZipFileExtensions]::ExtractToFile($member[0], $staged)
    } finally { $zip.Dispose() }
    $runtimeSignature = Get-AuthenticodeSignature $staged
    if ($runtimeSignature.Status -ne 'Valid' -or $runtimeSignature.SignerCertificate.Subject -notmatch [regex]::Escape($manifest.vcRuntime.publisher)) {
      throw 'Visual C++ runtime library does not have a valid trusted Microsoft signature.'
    }
    Move-Item -LiteralPath $staged -Destination (Join-Path $node $manifest.vcRuntime.member)
    Write-Host "Placed the verified Microsoft-signed $($manifest.vcRuntime.member) beside the pinned Node runtime. No administrator rights required."
  } finally { Remove-Item -LiteralPath $runtimeStage -Recurse -Force -ErrorAction SilentlyContinue }
}
$dotnet = Join-Path $tools "dotnet-$($manifest.dotnet.version)"
if (!(Test-Path (Join-Path $dotnet 'dotnet.exe'))) { Write-Host 'Extracting the .NET SDK.'; Expand-Archive $dotnetArchive $dotnet -Force }
$driverFolder = Join-Path $root '.cache\driver'
New-Item -ItemType Directory -Force $driverFolder | Out-Null
$driver = Join-Path $driverFolder "winfsp-$($manifest.winfsp.version).msi"
Get-Verified $manifest.winfsp $driver
Import-Module (Join-Path $PSHOME 'Modules\Microsoft.PowerShell.Security\Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$signature = Get-AuthenticodeSignature $driver
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Navimatics') {
  throw 'WinFsp installer does not have a valid trusted Navimatics signature.'
}
if ($InstallDriver) {
  Write-Host 'Installing the verified signed WinFsp driver.'
  $process = Start-Process msiexec.exe -ArgumentList @('/i', "`"$driver`"", '/qn', '/norestart', 'ADDLOCAL=ALL') -Wait -PassThru
  $installations = @()
  foreach ($registryPath in @('HKLM:\SOFTWARE\WOW6432Node\WinFsp', 'HKLM:\SOFTWARE\WinFsp')) {
    $registration = Get-ItemProperty $registryPath -ErrorAction SilentlyContinue
    if ($registration -and $registration.InstallDir) {
      $nativeDll = Join-Path $registration.InstallDir 'bin\winfsp-x64.dll'
      $dllPresent = Test-Path $nativeDll
      $dllVersion = $null
      $dllSignature = $null
      if ($dllPresent) {
        $dllVersion = (Get-Item $nativeDll).VersionInfo.FileVersion
        $dllSignature = (Get-AuthenticodeSignature $nativeDll).Status.ToString()
      }
      $installations += @{ registryView = $registryPath; nativeDllPresent = $dllPresent; nativeDllVersion = $dllVersion; nativeDllSignature = $dllSignature }
    }
  }
  $driverServices = @(Get-CimInstance Win32_SystemDriver -Filter "Name LIKE 'WinFsp%'" -ErrorAction SilentlyContinue | ForEach-Object { @{ name = $_.Name; state = $_.State; startMode = $_.StartMode } })
  $receipt = @{ version = $manifest.winfsp.version; msiDigestVerified = $true; msiSignature = $signature.Status.ToString(); installerExitCode = $process.ExitCode; rebootRequested = ($process.ExitCode -eq 3010); installations = $installations; driverServices = $driverServices }
  $evidence = Join-Path $root 'out\evidence'
  New-Item -ItemType Directory -Force $evidence | Out-Null
  $receipt | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidence 'driver-install.json')
  Write-Host "WinFsp installer exit code: $($process.ExitCode). Native registration entries: $($installations.Count)."
  if ($process.ExitCode -notin @(0,3010)) { throw "WinFsp installation failed: $($process.ExitCode)" }
}
$env:PATH = "$node;$dotnet;$env:PATH"
$env:DOTNET_ROOT = $dotnet
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'
Write-Host "Verified Node $($manifest.node.version), .NET $($manifest.dotnet.version), WinFsp $($manifest.winfsp.version)."
