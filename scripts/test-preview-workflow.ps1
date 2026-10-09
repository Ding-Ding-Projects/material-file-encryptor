$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$workflow = Get-Content (Join-Path $root '.github/workflows/windows.yml') -Raw
$checks = 0
function Check([bool]$Value, [string]$Name) { if (!$Value) { throw $Name }; $script:checks++; Write-Host "PASS $Name" }
function PublicationEnabled([string]$Text) {
 return $Text -match '(?m)^  push:\s*$' -and $Text -match '(?m)^  workflow_dispatch:' -and $Text -notmatch '(?m)^\s+(branches|branches-ignore|paths|paths-ignore):' -and $Text -notmatch 'pull_request|github\.ref\s*==' -and $Text -match '(?s)- name: Prepare and publish unique release\s+shell: powershell\s+run:'
}
Check (PublicationEnabled $workflow) 'push and dispatch publish without branch or event exclusions'
Check (!(PublicationEnabled ($workflow.Replace('      - name: Prepare and publish unique release', "      - name: Prepare and publish unique release`n        if: github.event_name == 'workflow_dispatch'")))) 'dispatch-only publication is rejected'
Check (!(PublicationEnabled ($workflow.Replace('  push:', '  push: [main]').Replace('    runs-on:', "    if: github.ref == 'refs/heads/main'`n    runs-on:")))) 'main-only delivery is rejected'
Check ($workflow.Contains('required: false') -and $workflow.Contains('./scripts/check-publication-source.ps1 -ExpectedSourceCommit $env:EXPECTED_SOURCE_COMMIT')) 'optional source constraint is wired'
Check ($workflow.Contains('run: build.bat /s') -and $workflow.Contains('run: build-installer.bat /s') -and $workflow.Contains('runs-on: windows-2022')) 'pinned Windows entrypoints retained'
Check ($workflow -notmatch '(?im)^\s*run:.*(test|lint|typecheck)' -and $workflow -notmatch '(?m)^\s+needs:') 'workflow contains no quality test or lint steps'
Check ($workflow.Contains('secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN') -and $workflow.Contains('actions: read')) 'release credential fallback and timing read permission retained'
Check ([regex]::Matches($workflow, 'if: always\(\)').Count -eq 2 -and [regex]::Matches($workflow, 'continue-on-error: true').Count -eq 2) 'safe outputs collected after failures'
$oldSha = $env:GITHUB_SHA
try {
 $env:GITHUB_SHA = (& git -C $root rev-parse HEAD).Trim()
 Push-Location $root
 try {
  & ./scripts/check-publication-source.ps1
  Check $true 'blank optional dispatch constraint accepted'
  & ./scripts/check-publication-source.ps1 -ExpectedSourceCommit $env:GITHUB_SHA
  Check $true 'matching exact source accepted'
  foreach ($bad in @('not-a-sha', ('0' * 40))) {
   $failed = $false
   try { & ./scripts/check-publication-source.ps1 -ExpectedSourceCommit $bad } catch { $failed = $_.Exception.Message -eq 'PUBLICATION_SOURCE_CHANGED' }
   Check $failed 'invalid or moved dispatch source rejected'
  }
 } finally { Pop-Location }
} finally { $env:GITHUB_SHA = $oldSha }
$publisher = Get-Content (Join-Path $root '.github/scripts/publish-preview.ps1') -Raw
$timing = $publisher.Substring($publisher.IndexOf('$workflowCompletedUtc=[DateTimeOffset]::UtcNow'))
$timingNotes = & {
 param($body)
 $workflowStartedUtc = [DateTimeOffset]::UtcNow.AddSeconds(-65)
 $source = 'fixture'; $repo = 'fixture'; $tag = 'fixture'; $output = 'unused'; $notes = 'Fixture notes'
 function Assert([bool]$condition,[string]$message) { if (!$condition) { throw $message } }
 function Set-Content { param($Path,$Encoding,[Parameter(ValueFromPipeline=$true)]$Value) process {} }
 function Gh([string[]]$Arguments) { if ($Arguments[1] -eq 'view') { return $notes }; if ($Arguments[1] -ne 'edit') { throw 'UNEXPECTED_NATIVE_OPERATION' } }
 . ([scriptblock]::Create($body))
 return $notes
} $timing
Check ($timingNotes -match 'Workflow started: .+Z?' -and $timingNotes -match 'Workflow completed: ' -and $timingNotes -match 'Workflow duration: 00:01:05') 'actual timing block formats measured duration and verifies note readback'
Check ($publisher.Contains('.jobs | map(.started_at) | min') -and $publisher.Contains('workflowUrl=$workflowUrl') -and $publisher.Contains("runtimeVerification='pending independent local receipt'")) 'first-job source timing and honest runtime boundary retained'
Check ($publisher.Contains('$tag="v1.$($env:GITHUB_RUN_NUMBER).$($env:GITHUB_RUN_ATTEMPT)"') -and $publisher.Contains('TAG_ALREADY_EXISTS') -and $publisher.Contains('RELEASE_ALREADY_EXISTS')) 'unique numeric delivery tags never reuse existing releases'
Check ($publisher.Contains("'--latest=true'") -and !$publisher.Contains("'--prerelease'") -and $publisher.Contains('Assert (!$published.isDraft -and !$published.isPrerelease)')) 'normal non-draft latest release required'
Check (!$publisher.Contains('prerelease=$true') -and $publisher.Contains('isDraft=$false;isPrerelease=$false;latest=$true') -and $publisher.Contains('packageVersion=')) 'release plan keeps actual package version distinct from normal delivery tag'
function NormalRelease([string]$Text) { return $Text.Contains("'--latest=true'") -and !$Text.Contains("'--prerelease'") -and $Text.Contains('Assert (!$published.isDraft -and !$published.isPrerelease)') }
Check (!(NormalRelease ($publisher.Replace("'--latest=true'", "'--prerelease','--latest=false'")))) 'prerelease command is rejected'
Check (!(NormalRelease ($publisher.Replace('Assert (!$published.isDraft -and !$published.isPrerelease)', 'Assert ($published.isDraft -or $published.isPrerelease)')))) 'draft or prerelease readback is rejected'
Write-Host "PASS: $checks release workflow and source checks."
