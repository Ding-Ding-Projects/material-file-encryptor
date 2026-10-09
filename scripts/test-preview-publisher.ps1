$ErrorActionPreference = 'Stop'
$publisher = Join-Path (Split-Path $PSScriptRoot -Parent) '.github\scripts\publish-preview.ps1'
$tokens = $null; $parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($publisher, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'PUBLISHER_PARSE_FAILED' }
$functions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'Gh' }, $true))
if ($functions.Count -ne 1) { throw 'EXPECTED_ONE_GH_WRAPPER' }
$current = $functions[0].Extent.Text
$nativeCall = '& (Get-Command gh.exe -CommandType Application -ErrorAction Stop).Source @Arguments'
if (!$current.Contains($nativeCall)) { throw 'EXPLICIT_NATIVE_GH_REQUIRED' }
$old = $current.Replace($nativeCall, '& gh @Arguments')
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
Write-Host 'Preview publisher regression: 3 checks passed; no publication code executed.'
