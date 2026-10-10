$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$manifest = Get-Content (Join-Path $root 'dependencies.json') -Raw | ConvertFrom-Json
$bootstrap = Get-Content (Join-Path $root 'scripts/bootstrap.ps1') -Raw
$build = Get-Content (Join-Path $root 'scripts/build.ps1') -Raw
$activation = [regex]::Match($bootstrap, '(?ms)^\$nugetExecutable =.*?^\$env:MFE_NUGET_EXECUTABLE =[^\r\n]+').Value
$staging = [regex]::Match($build, '(?ms)^\s*Copy-Item -LiteralPath \$env:MFE_NUGET_EXECUTABLE.*?throw ''Staged NuGet mismatch\.'' \}').Value
if (!$activation -or !$staging) { throw 'Missing NuGet activation or staging.' }
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ('nuget-vendor-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $tempRoot | Out-Null
$tools = $tempRoot
$vendorStage = Join-Path $tempRoot 'vendor'
New-Item -ItemType Directory $vendorStage | Out-Null
$previous = $env:MFE_NUGET_EXECUTABLE
try {
  function Get-Verified($entry, $file) { if ($entry.url -ne 'https://dist.nuget.org/win-x86-commandline/v7.9.0/nuget.exe' -or $entry.sha256 -ne '992d70cac5b06c38efec91806caba64cdcc07e6d963a0959dbbbaf264d33b800') { throw 'Wrong trusted pin.' }; $script:verified = $file }
  function Get-Item { param([string]$LiteralPath) return @{ VersionInfo = @{ FileVersion = $script:version } } }
  $script:version = '7.9.0.83'
  Invoke-Expression $activation
  if ($env:MFE_NUGET_EXECUTABLE -ne $script:verified) { throw 'Unverified executable selected.' }
  $script:version = '2.8.0.0'
  $rejected = $false
  try { Invoke-Expression $activation } catch { $rejected = $true }
  if (!$rejected) { throw 'Wrong version accepted.' }
  Remove-Item Function:Get-Item
  [IO.File]::WriteAllText($env:MFE_NUGET_EXECUTABLE, 'synthetic pinned executable')
  function Get-BootstrapDigest($file) { return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
  $manifest.nuget.sha256 = Get-BootstrapDigest $env:MFE_NUGET_EXECUTABLE
  Invoke-Expression $staging
  if ((Get-BootstrapDigest (Join-Path $vendorStage 'nuget.exe')) -ne $manifest.nuget.sha256) { throw 'Staged bytes differ.' }
  $manifest.nuget.sha256 = '0' * 64
  $rejected = $false
  try { Invoke-Expression $staging } catch { $rejected = $true }
  if (!$rejected) { throw 'Wrong staged digest accepted.' }
  Write-Host 'PASS: verified selection, version rejection, staged bytes, digest rejection.'
} finally {
  $env:MFE_NUGET_EXECUTABLE = $previous
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
