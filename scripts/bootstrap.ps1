param([switch]$InstallDriver)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Avoid per-byte/per-file progress overhead in Windows PowerShell.
$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content (Join-Path $root 'dependencies.json') -Raw | ConvertFrom-Json
$tools = Join-Path $env:LOCALAPPDATA 'MaterialFileEncryptor-BuildTools'
New-Item -ItemType Directory -Force $tools | Out-Null
function Get-Verified($entry, $file) {
  if (!(Test-Path $file)) { Write-Host "Downloading pinned dependency $($entry.version)."; Invoke-WebRequest -Uri $entry.url -OutFile $file -UseBasicParsing }
  Write-Host "Verifying pinned dependency $($entry.version)."
  $algorithm = if ($entry.sha512) { 'SHA512' } else { 'SHA256' }
  $expected = if ($entry.sha512) { $entry.sha512 } else { $entry.sha256 }
  if ((Get-FileHash $file -Algorithm $algorithm).Hash.ToLowerInvariant() -ne $expected) {
    Remove-Item $file -Force
    throw "Dependency digest mismatch. Download removed: $file"
  }
}
$nodeArchive = Join-Path $tools "node-$($manifest.node.version).zip"
Get-Verified $manifest.node $nodeArchive
$node = Join-Path $tools "node-v$($manifest.node.version)-win-x64"
if (!(Test-Path (Join-Path $node 'node.exe'))) { Write-Host 'Extracting Node.'; Expand-Archive $nodeArchive $tools -Force }
$dotnetArchive = Join-Path $tools "dotnet-$($manifest.dotnet.version).zip"
Get-Verified $manifest.dotnet $dotnetArchive
$dotnet = Join-Path $tools "dotnet-$($manifest.dotnet.version)"
if (!(Test-Path (Join-Path $dotnet 'dotnet.exe'))) { Write-Host 'Extracting the .NET SDK.'; Expand-Archive $dotnetArchive $dotnet -Force }
$driverFolder = Join-Path $root '.cache\driver'
New-Item -ItemType Directory -Force $driverFolder | Out-Null
$driver = Join-Path $driverFolder "winfsp-$($manifest.winfsp.version).msi"
Get-Verified $manifest.winfsp $driver
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

# Publishing tools use a pinned portable distribution without administrator rights.
if (!(Get-Command gh.exe -ErrorAction SilentlyContinue)) {
  $ghArchive = Join-Path $tools "gh-$($manifest.gh.version).zip"
  Get-Verified $manifest.gh $ghArchive
  $ghRoot = Join-Path $tools "gh-$($manifest.gh.version)"
  if (!(Test-Path (Join-Path $ghRoot 'bin\gh.exe'))) { Expand-Archive $ghArchive $ghRoot -Force }
  $env:PATH = "$(Join-Path $ghRoot 'bin');$env:PATH"
}
& gh.exe --version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI activation failed.' }
