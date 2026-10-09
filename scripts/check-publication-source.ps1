param([string]$ExpectedSourceCommit = '')
$ErrorActionPreference = 'Stop'
$actual = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actual -notmatch '^[0-9a-f]{40}$' -or $env:GITHUB_SHA -ne $actual) { throw 'PUBLICATION_SOURCE_CHANGED' }
if ($ExpectedSourceCommit -and ($ExpectedSourceCommit -notmatch '^[0-9a-f]{40}$' -or $actual -ne $ExpectedSourceCommit)) { throw 'PUBLICATION_SOURCE_CHANGED' }
