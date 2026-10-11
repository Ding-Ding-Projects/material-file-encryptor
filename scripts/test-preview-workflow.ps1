$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$workflow = Get-Content (Join-Path $root '.github/workflows/windows.yml') -Raw
$checks = 0
function Check([bool]$Value, [string]$Name) { if (!$Value) { throw $Name }; $script:checks++; Write-Host "PASS $Name" }
function PublicationEnabled([string]$Text) {
 $Text=($Text -split '(?m)^  promote:',2)[0]
 return $Text -match '(?m)^  push:\r?\n    branches: \[\x27\*\*\x27\]\s*$' -and $Text -match '(?m)^  workflow_dispatch:' -and $Text -notmatch '(?m)^\s+(tags|tags-ignore|branches-ignore|paths|paths-ignore):' -and $Text -notmatch 'pull_request|github\.ref\s*==' -and $Text -match '(?s)- name: Prepare and publish unique release\s+shell: powershell\s+run:'
}
Check (PublicationEnabled $workflow) 'every branch push and dispatch publish while tags cannot trigger delivery'
Check (!(PublicationEnabled ($workflow.Replace("    branches: ['**']", '')))) 'unrestricted tag-admitting push is rejected'
Check (!(PublicationEnabled ($workflow.Replace('      - name: Prepare and publish unique release', "      - name: Prepare and publish unique release`n        if: github.event_name == 'workflow_dispatch'")))) 'dispatch-only publication is rejected'
Check (!(PublicationEnabled ($workflow.Replace("branches: ['**']", 'branches: [main]').Replace('    runs-on:', "    if: github.ref == 'refs/heads/main'`n    runs-on:")))) 'main-only delivery is rejected'
Check ($workflow.Contains('required: false') -and $workflow.Contains('./scripts/check-publication-source.ps1 -ExpectedSourceCommit $env:EXPECTED_SOURCE_COMMIT')) 'optional source constraint is wired'
Check ($workflow.Contains('run: build.bat /s') -and $workflow.Contains('run: build-installer.bat /s') -and $workflow.Contains('runs-on: windows-2022')) 'pinned Windows entrypoints retained'
Check ($workflow -notmatch '(?im)^\s*run:.*(test|lint|typecheck)') 'workflow contains no quality test or lint steps'
Check ($workflow.Contains('secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN') -and $workflow.Contains('actions: read')) 'release credential fallback and timing read permission retained'
function SafeOutputs([string]$Text) {
 $required=@('Record safe result','windows-installer-and-evidence','Preserve compiled server lease verifier','Preserve dependency download diagnostics','Record safe promotion result','Preserve promotion decision')
 $steps=@($Text -split '(?m)^      - ')
 foreach ($name in $required) { $found=@($steps | Where-Object { $_.Contains($name) }); if ($found.Count -ne 1 -or $found[0] -notmatch 'always\(\)' -or $found[0] -notmatch 'continue-on-error: true') { return $false } }
 return $true
}
Check (SafeOutputs $workflow) 'each required output preserves original failure status'
Check (!(SafeOutputs ($workflow.Replace('continue-on-error: true','continue-on-error: false')))) 'unsafe output collection is rejected'
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
Check ($publisher.Contains("'--latest=false'") -and !$publisher.Contains("'--prerelease'") -and $publisher.Contains('Assert (!$published.isDraft -and !$published.isPrerelease)')) 'normal non-draft download-only publication required'
Check (!$publisher.Contains('prerelease=$true') -and $publisher.Contains("isDraft=`$false;isPrerelease=`$false;latest='false-until-verified-current-main'") -and $publisher.Contains('packageVersion=')) 'release plan keeps actual package version distinct from normal delivery tag'
function NormalRelease([string]$Text) { return $Text.Contains("'--latest=false'") -and !$Text.Contains("'--prerelease'") -and $Text.Contains('Assert (!$published.isDraft -and !$published.isPrerelease)') }
Check (!(NormalRelease ($publisher.Replace("'--latest=false'", "'--prerelease','--latest=true'")))) 'prerelease command is rejected'
Check (!(NormalRelease ($publisher.Replace('Assert (!$published.isDraft -and !$published.isPrerelease)', 'Assert ($published.isDraft -or $published.isPrerelease)')))) 'draft or prerelease readback is rejected'

function WorkflowJobsCovered([string]$Text, $Inventory) {
 $actual=@([regex]::Matches(($Text -split '(?m)^jobs:',2)[1], '(?m)^  ([a-z][a-z0-9_-]*):\s*$') | ForEach-Object { $_.Groups[1].Value })
 $required=@('windows','promote')
 $toolsByJob=@{
  windows=@('Windows PowerShell 5.1','cmd.exe','Git','GitHub CLI','Node.js','npm','pinned .NET SDK','7-Zip','NuGet','WinFsp packaging files')
  promote=@('Windows PowerShell >=5.1','Git','GitHub CLI','Node.js')
 }
 $markersByJob=@{windows=@('run: build.bat /s','run: build-installer.bat /s','. ./scripts/bootstrap.ps1');promote=@('. ./.github/scripts/bootstrap-promotion.ps1')}
 if ((($actual | Sort-Object) -join ',') -ne (($required | Sort-Object) -join ',')) { return $false }
 if ((($Inventory.jobs.PSObject.Properties.Name | Sort-Object) -join ',') -ne (($required | Sort-Object) -join ',')) { return $false }
 foreach ($job in $required) {
  $part=(($Text -split ('(?m)^  '+$job+':'),2)[1] -split '(?m)^  [a-z][a-z0-9_-]*:',2)[0]
  $entry=$Inventory.jobs.$job
  if (@($entry.tools).Count -eq 0 -or @($entry.bootstrapMarkers).Count -eq 0) { return $false }
  if ((($entry.tools | Sort-Object) -join ',') -ne (($toolsByJob[$job] | Sort-Object) -join ',')) { return $false }
  if ((($entry.bootstrapMarkers | Sort-Object) -join ',') -ne (($markersByJob[$job] | Sort-Object) -join ',')) { return $false }
  foreach ($marker in $entry.bootstrapMarkers) { if (!$part.Contains($marker)) { return $false } }
 }
 return $true
}
$inventory=Get-Content (Join-Path $root '.github/workflows/windows.dependencies.json') -Raw | ConvertFrom-Json
Check (WorkflowJobsCovered $workflow $inventory) 'handwritten job inventory covers both bootstrap routes'
Check (!(WorkflowJobsCovered ($workflow + "
  omitted:
    runs-on: windows-2022
") $inventory)) 'unlisted workflow job is rejected'
Check (!(WorkflowJobsCovered ($workflow.Replace('bootstrap-promotion.ps1','missing-bootstrap.ps1')) $inventory)) 'missing promotion bootstrap is rejected'
$incompleteInventory=$inventory | ConvertTo-Json -Depth 8 | ConvertFrom-Json
$incompleteInventory.jobs.promote.tools=@('GitHub CLI')
Check (!(WorkflowJobsCovered $workflow $incompleteInventory)) 'omitted promotion tool is rejected'

Write-Host "PASS: $checks release workflow and source checks."
