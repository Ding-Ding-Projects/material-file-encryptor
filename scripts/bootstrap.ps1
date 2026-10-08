param([switch]$InstallDriver)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content (Join-Path $root 'dependencies.json') -Raw | ConvertFrom-Json
$tools = Join-Path $env:LOCALAPPDATA 'MaterialFileEncryptor\BuildTools'
New-Item -ItemType Directory -Force $tools | Out-Null
function Get-Verified($entry, $file) {
  if (!(Test-Path $file)) { Invoke-WebRequest -Uri $entry.url -OutFile $file -UseBasicParsing }
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
if (!(Test-Path (Join-Path $node 'node.exe'))) { Expand-Archive $nodeArchive $tools -Force }
$dotnetArchive = Join-Path $tools "dotnet-$($manifest.dotnet.version).zip"
Get-Verified $manifest.dotnet $dotnetArchive
$dotnet = Join-Path $tools "dotnet-$($manifest.dotnet.version)"
if (!(Test-Path (Join-Path $dotnet 'dotnet.exe'))) { Expand-Archive $dotnetArchive $dotnet -Force }
$driverFolder = Join-Path $root '.cache\driver'
New-Item -ItemType Directory -Force $driverFolder | Out-Null
$driver = Join-Path $driverFolder "winfsp-$($manifest.winfsp.version).msi"
Get-Verified $manifest.winfsp $driver
$signature = Get-AuthenticodeSignature $driver
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Navimatics') {
  throw 'WinFsp installer does not have a valid trusted Navimatics signature.'
}
if ($InstallDriver) {
  $process = Start-Process msiexec.exe -ArgumentList @('/i', "`"$driver`"", '/qn', '/norestart', 'ADDLOCAL=ALL') -Wait -PassThru
  if ($process.ExitCode -notin @(0,3010)) { throw "WinFsp installation failed: $($process.ExitCode)" }
}
$env:PATH = "$node;$dotnet;$env:PATH"
$env:DOTNET_ROOT = $dotnet
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'
Write-Host "Verified Node $($manifest.node.version), .NET $($manifest.dotnet.version), WinFsp $($manifest.winfsp.version)."
