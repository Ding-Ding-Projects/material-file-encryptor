$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Initialize the trusted framework before accepting cancellable extraction work.
Add-Type -AssemblyName System.IO.Compression
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public sealed class OllamaDirectoryLease : IDisposable {
 readonly List<SafeFileHandle> handles = new List<SafeFileHandle>();
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sec,uint c,uint f,IntPtr t);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder p,uint n,uint f);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
 [StructLayout(LayoutKind.Sequential)] struct Info {public uint attrs;public System.Runtime.InteropServices.ComTypes.FILETIME creation,access,write;public uint volume,high,low,links,indexHigh,indexLow;}
 public static void Validate(SafeFileHandle h,string expected,bool directory) {
  Info i; if(h.IsInvalid||!GetFileInformationByHandle(h,out i)||(i.attrs&0x400)!=0||((i.attrs&0x10)!=0)!=directory||(!directory&&i.links!=1))throw new IOException("Identity");
  var b=new StringBuilder(32768);uint n=GetFinalPathNameByHandleW(h,b,(uint)b.Capacity,0);if(n==0||n>=b.Capacity||!String.Equals(b.ToString(),"\\\\?\\"+Path.GetFullPath(expected),StringComparison.OrdinalIgnoreCase))throw new IOException("Identity");
 }
 public void Pin(string directory){var paths=new Stack<string>();while(!String.IsNullOrEmpty(directory)){paths.Push(directory);directory=Path.GetDirectoryName(directory);}while(paths.Count>0){string p=paths.Pop();var h=CreateFileW(p,0,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);try{Validate(h,p,true);handles.Add(h);}catch{h.Dispose();throw;}}}
 public void Dispose(){foreach(var h in handles)h.Dispose();handles.Clear();}
}
'@
[Console]::Out.WriteLine('INITIALIZED'); [Console]::Out.Flush()
$lease = New-Object OllamaDirectoryLease
$archive = $null
$reader = $null
try {
 $phase='CONFIG'
 $configuration = $env:MFE_OLLAMA_EXTRACTION_CONFIGURATION | ConvertFrom-Json
 [Environment]::SetEnvironmentVariable('MFE_OLLAMA_EXTRACTION_CONFIGURATION',$null,'Process')
 if ($configuration.schemaVersion -ne 1 -or $configuration.files.Count -lt 2 -or $configuration.files.Count -gt 4096) { throw 'Manifest' }
 $archivePath = [IO.Path]::GetFullPath([string]$configuration.archive)
 $stage = [IO.Path]::GetFullPath([string]$configuration.stage)
 $phase='LEASE'
 $lease.Pin([IO.Path]::GetDirectoryName($archivePath)); $lease.Pin($stage)
 if ([IO.Directory]::GetFileSystemEntries($stage).Length -ne 0) { throw 'Stage' }
 $archive = [IO.File]::Open($archivePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 [OllamaDirectoryLease]::Validate($archive.SafeFileHandle,$archivePath,$false)
 if ($archive.Length -ne $configuration.bytes -or $archive.Length -gt 2147483648) { throw 'Size' }
 $cancelPath=[IO.Path]::GetFullPath([string]$configuration.cancelPath);if([IO.Path]::GetDirectoryName($cancelPath) -ne [IO.Path]::GetDirectoryName($stage)){throw 'Cancellation'}
 [Console]::Out.WriteLine('READY'); [Console]::Out.Flush()
 function Check-Cancel { if ([IO.File]::Exists($cancelPath)) { throw 'Cancelled' } }
 function Hash-Stream($stream) {
  $hash=[Security.Cryptography.SHA256]::Create();try{$buffer=New-Object byte[] 1048576;while(($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0){Check-Cancel;[void]$hash.TransformBlock($buffer,0,$count,$buffer,0)};[void]$hash.TransformFinalBlock($buffer,0,0);return ([BitConverter]::ToString($hash.Hash)).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()}
 }
 $phase='HASH'
 if ((Hash-Stream $archive) -ne $configuration.sha256) { throw 'Hash' }
 $archive.Position=0
 $reader=New-Object IO.Compression.ZipArchive($archive,[IO.Compression.ZipArchiveMode]::Read,$true)
 $phase='MEMBERSHIP'
 $expected=New-Object 'Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
 $names=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
 $directories=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
 [long]$total=0
 foreach($row in $configuration.files){
  $name=[string]$row.path
  if($name -notmatch '^[^\\:]+$' -or $name.StartsWith('/') -or ($name.Split('/') | Where-Object {$_ -eq '' -or $_ -eq '.' -or $_ -eq '..' -or $_.EndsWith('.') -or $_.EndsWith(' ')}) -or !$names.Add($name) -or $row.bytes -lt 0 -or $row.bytes -gt 4294967296 -or $row.sha256 -notmatch '^[a-f0-9]{64}$'){throw 'Manifest'}
  $expected.Add($name,$row);$total+=$row.bytes;if($total -gt 8589934592){throw 'Size'}
  $parent=[IO.Path]::GetDirectoryName($name.Replace('/','\'));while($parent){[void]$directories.Add($parent.Replace('\','/')+'/');$parent=[IO.Path]::GetDirectoryName($parent)}
 }
 if($total -ne $configuration.expandedBytes -or $reader.Entries.Count -gt 4096){throw 'Manifest'}
 $seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
 foreach($entry in $reader.Entries){Check-Cancel;$name=$entry.FullName;if(!$seen.Add($name)){throw 'Duplicate'}
  $mode=($entry.ExternalAttributes -shr 16) -band 61440;if($mode -ne 0 -and $mode -ne 32768 -and $mode -ne 16384){throw 'Link'}
  if($name.EndsWith('/')){if(!$directories.Contains($name) -or $entry.Length -ne 0){throw 'Directory'};continue}
  if(!$expected.ContainsKey($name) -or $entry.Length -ne $expected[$name].bytes){throw 'Membership'}
 }
 foreach($name in $expected.Keys){if(!$seen.Contains($name)){throw 'Membership'}}
 $phase='EXTRACT'
 foreach($entry in $reader.Entries){Check-Cancel;if($entry.FullName.EndsWith('/')){continue};$row=$expected[$entry.FullName];$target=[IO.Path]::Combine($stage,$entry.FullName.Replace('/','\'));$parent=$stage;$segments=$entry.FullName.Split('/');for($n=0;$n -lt $segments.Length-1;$n++){$parent=[IO.Path]::Combine($parent,$segments[$n]);[void][IO.Directory]::CreateDirectory($parent);$lease.Pin($parent)}
  $input=$entry.Open();$output=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try{[OllamaDirectoryLease]::Validate($output.SafeFileHandle,$target,$false);$buffer=New-Object byte[] 1048576;[long]$written=0;while(($count=$input.Read($buffer,0,$buffer.Length)) -gt 0){Check-Cancel;$written+=$count;if($written -gt $row.bytes){throw 'Size'};$output.Write($buffer,0,$count)};$output.Flush($true);if($written -ne $row.bytes){throw 'Size'};$output.Position=0;if((Hash-Stream $output) -ne $row.sha256){throw 'Hash'}}finally{$input.Dispose();$output.Dispose()}
 }
 Check-Cancel
 [Console]::Out.WriteLine('COMPLETE');[Console]::Out.Flush()
} catch { [Console]::Out.WriteLine('FAILED:'+ $phase);[Console]::Out.Flush();exit 1 }
finally { if($reader){$reader.Dispose()};if($archive){$archive.Dispose()};$lease.Dispose() }
