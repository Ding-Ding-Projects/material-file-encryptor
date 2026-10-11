$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/verified-download.ps1')
Add-Type -TypeDefinition @'
using System.IO;
using System.Threading;
using System.Threading.Tasks;
public sealed class FrameworkAsyncBody : MemoryStream {
  public FrameworkAsyncBody(byte[] bytes) : base(bytes) {}
  public override async Task CopyToAsync(Stream destination, int bufferSize, CancellationToken cancellationToken) {
    await Task.Delay(1, cancellationToken);
    base.CopyTo(destination, bufferSize);
  }
}
'@
$probe=New-Object FrameworkAsyncBody(,[byte[]]@(65)); $sink=New-Object IO.MemoryStream
$raw=@($probe.CopyToAsync($sink,81920,[Threading.CancellationToken]::None).GetAwaiter().GetResult())
if($raw.Count -ne 1 -or $raw[0].GetType().FullName -ne 'System.Threading.Tasks.VoidTaskResult'){throw 'Framework task reproduction missing'}
$probe.Dispose();$sink.Dispose()
$tools=Join-Path ([IO.Path]::GetTempPath()) ('framework-download-'+[Guid]::NewGuid().ToString('N')); New-Item -ItemType Directory $tools|Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fixture=Join-Path $tools 'fixture';New-Item -ItemType Directory $fixture|Out-Null;[IO.File]::WriteAllText((Join-Path $fixture 'tool.txt'),'fixture')
$zip=Join-Path $tools 'fixture.zip';[IO.Compression.ZipFile]::CreateFromDirectory($fixture,$zip);$bytes=[IO.File]::ReadAllBytes($zip)
$entry=@{version='fixture';url='https://fixture.example/tool.zip';sha256=(Get-BootstrapDigest $zip)}
$transport={param($url,$stream,$timeout) $body=New-Object FrameworkAsyncBody(,$bytes);try{Copy-BootstrapBody $body $stream ([Threading.CancellationToken]::None)}finally{$body.Dispose()};return 200}
$result=@(Get-Verified $entry (Join-Path $tools 'download.zip') $transport)
if($result.Count -ne 0){throw 'Get-Verified emitted task output'}
# Load the production activation functions without running bootstrap or using the network.
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '../scripts/bootstrap.ps1'),[ref]$tokens,[ref]$errors)
foreach($name in @('Test-PortableTree','Activate-PortableTool')){
  $node=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
  Invoke-Expression $node.Extent.Text
}
$originalVerified=${function:Get-Verified}
function Get-Verified($entry,$file){ & $originalVerified $entry $file $transport }
$result=@(Activate-PortableTool 'fixture-tool' $entry)
if($result.Count -ne 1 -or $result[0] -isnot [string] -or $result[0] -cne (Join-Path $tools 'fixture-tool-fixture')){throw 'Portable activation did not return exactly one path'}
if([IO.File]::ReadAllText((Join-Path $result[0] 'tool.txt')) -cne 'fixture'){throw 'Portable tree not activated'}
Write-Host 'PASS: actual Framework VoidTaskResult reproduction; verification output zero; activation output one path.'
Write-Host "Retained Framework fixture: $tools"
