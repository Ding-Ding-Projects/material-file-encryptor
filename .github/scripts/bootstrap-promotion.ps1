$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion -lt [Version]'5.1') { throw 'PROMOTION_POWERSHELL_UNSUPPORTED' }
. "$PSScriptRoot/../../scripts/bootstrap.ps1" -RuntimeToolsOnly
$nodeRoot=Activate-PortableTool 'promotion-node' $manifest.node
$nodeExecutable=Join-Path $nodeRoot "node-v$($manifest.node.version)-win-x64/node.exe"
$version=& $nodeExecutable --version
if ($LASTEXITCODE -ne 0 -or $version -ne "v$($manifest.node.version)") { throw 'PROMOTION_NODE_VERSION_MISMATCH' }
$env:PATH="$(Split-Path $nodeExecutable);$env:PATH"
Write-Host 'Verified promotion tools: pinned Node.js, GitHub CLI, Git, and supported Windows PowerShell. No application build tools or driver installation requested.'
