$ErrorActionPreference = 'Stop'
$publisher = Join-Path (Split-Path $PSScriptRoot -Parent) '.github\scripts\publish-preview.ps1'
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($publisher, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'PUBLISHER_PARSE_FAILED' }
$functions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Gh' }, $true))
if ($functions.Count -ne 1) { throw 'EXPECTED_ONE_GH_WRAPPER' }
$current = $functions[0].Extent.Text
$nativeCall = '[Management.Automation.ApplicationInfo]$nativeGh = Get-Command gh.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1; $result = & $nativeGh.Source @Arguments'
if (!$current.Contains($nativeCall)) { throw 'EXPLICIT_FIRST_NATIVE_GH_REQUIRED' }
$old = $current.Replace($nativeCall, '$result = & gh @Arguments')
# Execute only the extracted function in a child scope. Publisher main never runs.
$oldRecursed = $false
try { & ([scriptblock]::Create($old + "`nGh --version")) | Out-Null }
catch { if ($_.FullyQualifiedErrorId -notlike '*CallDepthOverflow*') { throw }; $oldRecursed = $true }
if (!$oldRecursed) { throw 'OLD_WRAPPER_DID_NOT_FAIL' }
Write-Host 'PASS original wrapper fails with CallDepthOverflow'
$version = & ([scriptblock]::Create($current + "`nGh --version"))
if (@($version).Count -eq 0 -or @($version)[0] -notmatch '^gh version [0-9]') { throw 'REAL_GH_VERSION_REQUIRED' }
Write-Host 'PASS current wrapper returns real gh version'
$nonzeroPropagated = $false
try { & ([scriptblock]::Create($current + "`nGh __mfe_test_invalid_command__")) | Out-Null }
catch { if ($_.Exception.Message -ne 'GITHUB_CLI_OPERATION_FAILED') { throw }; $nonzeroPropagated = $true }
if (!$nonzeroPropagated) { throw 'GH_NONZERO_NOT_PROPAGATED' }
Write-Host 'PASS current wrapper propagates native nonzero exit'
$manifest = Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'dependencies.json') -Raw | ConvertFrom-Json
$pinned = Join-Path $env:LOCALAPPDATA "MaterialFileEncryptor-BuildTools\gh-$($manifest.gh.version)\bin\gh.exe"
if (!(Test-Path -LiteralPath $pinned -PathType Leaf)) { throw 'PINNED_SECOND_GH_REQUIRED' }
$hosted = @(Get-Command gh.exe -CommandType Application -ErrorAction Stop | Where-Object { $_.Source -ine $pinned })
if ($hosted.Count -eq 0) { throw 'DISTINCT_HOSTED_GH_REQUIRED' }
$savedPath = $env:PATH
try {
    $env:PATH = (Split-Path $pinned -Parent) + ';' + (Split-Path $hosted[0].Source -Parent) + ';' + $savedPath
    $visible = @(Get-Command gh.exe -CommandType Application -ErrorAction Stop)
    if (@($visible.Source | Select-Object -Unique).Count -lt 2 -or $visible[0].Source -ine $pinned) { throw 'TWO_REAL_NATIVE_GH_PATHS_REQUIRED' }
    $ambiguous = $current.Replace($nativeCall, '$result = & (Get-Command gh.exe -CommandType Application -ErrorAction Stop).Source @Arguments')
    $failed = $false
    try { & ([scriptblock]::Create($ambiguous + "`nGh --version")) | Out-Null }
    catch { if ($_.Exception -isnot [Management.Automation.CommandNotFoundException]) { throw }; $failed = $true }
    if (!$failed) { throw 'AMBIGUOUS_NATIVE_RESOLVER_DID_NOT_FAIL' }
    Write-Host 'PASS previous resolver fails with two real visible gh executables'
    $expectedVersion = & $pinned --version
    if ($LASTEXITCODE -ne 0) { throw 'PINNED_GH_VERSION_FAILED' }
    $actualVersion = & ([scriptblock]::Create($current + "`nGh --version"))
    if (($actualVersion -join "`n") -cne ($expectedVersion -join "`n")) { throw 'FIRST_NATIVE_GH_NOT_SELECTED' }
    Write-Host 'PASS current wrapper selects first real native executable with two visible paths'
} finally { $env:PATH = $savedPath }
Write-Host 'Preview publisher regression: 5 checks passed; no publication code executed.'
