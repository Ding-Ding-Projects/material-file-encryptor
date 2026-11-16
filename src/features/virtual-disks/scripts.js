import {COMPACT_MODES} from './limits.js';

/**
 * PowerShell and DiskPart text for each operation. Scripts are static templates: every caller value travels as a base64 JSON
 * parameter block that the script decodes into $p, so no path or label is ever spliced into script text.
 */
export const ROUTES = Object.freeze(['storage', 'hyperv', 'diskpart']);

const PREAMBLE = "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';";

function wrap(body) {
  return PREAMBLE
    + "$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('{{PARAMS}}'))|ConvertFrom-Json;"
    + "try{$r=& {" + body + "};$o=@{ok=$true;result=$r}}catch{$o=@{ok=$false;error=$_.Exception.Message}};"
    + "$j=$o|ConvertTo-Json -Depth 6 -Compress;if($p.resultFile){[IO.File]::WriteAllText($p.resultFile,$j)}else{$j}";
}

const DESCRIBE = "function Describe($path){$i=Get-DiskImage -ImagePath $path;$o=[ordered]@{path=$path;attached=[bool]$i.Attached;sizeBytes=[int64]$i.Size;fileBytes=[int64]$i.FileSize;storageType=[string]$i.StorageType;devicePath=[string]$i.DevicePath;logicalSectorSize=[int]$i.LogicalSectorSize;blockSize=[int64]$i.BlockSize;number=$null;letters=@();readOnly=$false;partitionStyle='';partitions=0};"
  + "if($i.Attached){$d=$i|Get-Disk;$o.number=[int]$d.Number;$o.readOnly=[bool]$d.IsReadOnly;$o.partitionStyle=[string]$d.PartitionStyle;$ps=@(Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue);$o.partitions=$ps.Count;$o.letters=@($ps|Where-Object DriveLetter|ForEach-Object{[string]$_.DriveLetter})}"
  + "if(Get-Command Get-VHD -ErrorAction SilentlyContinue){try{$v=Get-VHD -Path $path;$o.format=[string]$v.VhdFormat;$o.type=[string]$v.VhdType;$o.minimumBytes=[int64]$v.MinimumSize;$o.physicalSectorSize=[int]$v.PhysicalSectorSize;$o.fragmentation=[int]$v.FragmentationPercentage;$o.parentPath=[string]$v.ParentPath;$o.diskIdentifier=[string]$v.DiskIdentifier;$o.blockSize=[int64]$v.BlockSize}catch{}};[pscustomobject]$o}";

const BODIES = {
  capabilities: "$id=[Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent();"
    + "[pscustomobject]@{elevated=$id.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator);storage=[bool](Get-Command Mount-DiskImage -ErrorAction SilentlyContinue);hyperv=[bool](Get-Command New-VHD -ErrorAction SilentlyContinue);optimize=[bool](Get-Command Optimize-VHD -ErrorAction SilentlyContinue);diskpart=(Test-Path (Join-Path $env:SystemRoot 'System32\\diskpart.exe'));build=[Environment]::OSVersion.Version.ToString()}",
  list: "$rows=@(Get-Disk|Where-Object{$_.BusType -eq 'File Backed Virtual'}|ForEach-Object{$d=$_;$ps=@(Get-Partition -DiskNumber $d.Number -ErrorAction SilentlyContinue);[pscustomobject]@{number=[int]$d.Number;path=[string]$d.Location;sizeBytes=[int64]$d.Size;readOnly=[bool]$d.IsReadOnly;partitionStyle=[string]$d.PartitionStyle;online=([string]$d.OperationalStatus -eq 'Online');partitions=$ps.Count;letters=@($ps|Where-Object DriveLetter|ForEach-Object{[string]$_.DriveLetter})}});@{disks=$rows}",
  inspect: DESCRIBE + ";Describe $p.path",
  create_hyperv: "if(Test-Path -LiteralPath $p.path){throw 'The file already exists. Choose a new file name.'};$a=@{Path=$p.path;SizeBytes=[int64]$p.sizeBytes};if($p.type -eq 'fixed'){$a.Fixed=$true}else{$a.Dynamic=$true};if($p.blockSizeBytes){$a.BlockSizeBytes=[int64]$p.blockSizeBytes};if($p.logicalSectorSize){$a.LogicalSectorSizeBytes=[int]$p.logicalSectorSize};if($p.physicalSectorSize){$a.PhysicalSectorSizeBytes=[int]$p.physicalSectorSize};$null=New-VHD @a;@{path=$p.path;route='hyperv'}",
  create_diskpart: "if(Test-Path -LiteralPath $p.path){throw 'The file already exists. Choose a new file name.'};$mb=[int64]($p.sizeBytes/1MB);$t=if($p.type -eq 'fixed'){'fixed'}else{'expandable'};$s=Join-Path $env:TEMP ('vd-'+[guid]::NewGuid().ToString('N')+'.txt');try{Set-Content -LiteralPath $s -Value (\"create vdisk file=`\"$($p.path)`\" maximum=$mb type=$t\") -Encoding ASCII;$out=& diskpart.exe /s $s;if($LASTEXITCODE -ne 0 -or -not(Test-Path -LiteralPath $p.path)){throw ('DiskPart did not create the disk. '+($out -join ' '))}}finally{Remove-Item -LiteralPath $s -Force -ErrorAction SilentlyContinue};@{path=$p.path;route='diskpart'}",
  initialize: "$i=Get-DiskImage -ImagePath $p.path;if(-not $i.Attached){$null=Mount-DiskImage -ImagePath $p.path;$i=Get-DiskImage -ImagePath $p.path};$d=$i|Get-Disk;if($d.PartitionStyle -ne 'RAW'){throw 'The new disk is not empty, so it was left unformatted.'};Initialize-Disk -Number $d.Number -PartitionStyle $p.initialize.partitionStyle;$part=New-Partition -DiskNumber $d.Number -UseMaximumSize -AssignDriveLetter;$null=Format-Volume -Partition $part -FileSystem $p.initialize.fileSystem -NewFileSystemLabel $p.initialize.label -Confirm:$false;@{number=[int]$d.Number;letter=[string]$part.DriveLetter}",
  attach: "$i=Get-DiskImage -ImagePath $p.path;if($i.Attached){@{alreadyAttached=$true;path=$p.path}}else{$acc=if($p.readOnly){'ReadOnly'}else{'ReadWrite'};$null=Mount-DiskImage -ImagePath $p.path -Access $acc;@{alreadyAttached=$false;path=$p.path}}",
  mountIso: "$i=Get-DiskImage -ImagePath $p.path;if($i.Attached){@{alreadyAttached=$true;path=$p.path}}else{$null=Mount-DiskImage -ImagePath $p.path -StorageType ISO -Access ReadOnly;$v=Get-DiskImage -ImagePath $p.path|Get-Volume;@{alreadyAttached=$false;path=$p.path;letter=[string]$v.DriveLetter}}",
  detach: "$i=Get-DiskImage -ImagePath $p.path;if(-not $i.Attached){@{alreadyDetached=$true;path=$p.path}}else{Dismount-DiskImage -ImagePath $p.path;@{alreadyDetached=$false;path=$p.path}}",
  resize_hyperv: "$before=(Get-VHD -Path $p.path).Size;Resize-VHD -Path $p.path -SizeBytes ([int64]$p.sizeBytes);if($p.extendPartition){$i=Get-DiskImage -ImagePath $p.path;$was=[bool]$i.Attached;if(-not $was){$null=Mount-DiskImage -ImagePath $p.path;$i=Get-DiskImage -ImagePath $p.path};$d=$i|Get-Disk;$pt=Get-Partition -DiskNumber $d.Number|Where-Object Type -ne 'Reserved'|Sort-Object Offset|Select-Object -Last 1;if($pt){$max=(Get-PartitionSupportedSize -DiskNumber $d.Number -PartitionNumber $pt.PartitionNumber).SizeMax;Resize-Partition -DiskNumber $d.Number -PartitionNumber $pt.PartitionNumber -Size $max};if(-not $was){Dismount-DiskImage -ImagePath $p.path}};@{before=[int64]$before;after=[int64](Get-VHD -Path $p.path).Size;route='hyperv'}",
  resize_diskpart: "$mb=[int64]($p.sizeBytes/1MB);$s=Join-Path $env:TEMP ('vd-'+[guid]::NewGuid().ToString('N')+'.txt');try{Set-Content -LiteralPath $s -Value @(\"select vdisk file=`\"$($p.path)`\"\",\"expand vdisk maximum=$mb\") -Encoding ASCII;$out=& diskpart.exe /s $s;if($LASTEXITCODE -ne 0){throw ('DiskPart did not expand the disk. '+($out -join ' '))}}finally{Remove-Item -LiteralPath $s -Force -ErrorAction SilentlyContinue};@{route='diskpart';after=[int64]$p.sizeBytes}",
  compact_hyperv: "$before=(Get-Item -LiteralPath $p.path).Length;$i=Get-DiskImage -ImagePath $p.path;$was=[bool]$i.Attached;if($was){Dismount-DiskImage -ImagePath $p.path};if($p.mode -in 'Quick','Retrim'){$null=Mount-DiskImage -ImagePath $p.path -Access ReadOnly;$mounted=$true};try{Optimize-VHD -Path $p.path -Mode $p.mode}finally{if($mounted){Dismount-DiskImage -ImagePath $p.path}};if($was){$null=Mount-DiskImage -ImagePath $p.path};@{before=[int64]$before;after=[int64](Get-Item -LiteralPath $p.path).Length;mode=$p.mode;route='hyperv'}",
  compact_diskpart: "$before=(Get-Item -LiteralPath $p.path).Length;$s=Join-Path $env:TEMP ('vd-'+[guid]::NewGuid().ToString('N')+'.txt');try{Set-Content -LiteralPath $s -Value @(\"select vdisk file=`\"$($p.path)`\"\",'attach vdisk readonly','compact vdisk','detach vdisk') -Encoding ASCII;$out=& diskpart.exe /s $s;if($LASTEXITCODE -ne 0){throw ('DiskPart did not compact the disk. '+($out -join ' '))}}finally{Remove-Item -LiteralPath $s -Force -ErrorAction SilentlyContinue};@{before=[int64]$before;after=[int64](Get-Item -LiteralPath $p.path).Length;mode='Full';route='diskpart'}",
  convert: "if(Test-Path -LiteralPath $p.destination){throw 'The destination already exists. Choose a new file name.'};$t=if($p.type -eq 'fixed'){'Fixed'}else{'Dynamic'};Convert-VHD -Path $p.path -DestinationPath $p.destination -VHDType $t;@{path=$p.destination;route='hyperv'}"
};

export const OPERATIONS = Object.freeze(Object.keys(BODIES));

/** One operation name, or an array of names run in order inside one script so a single administrator prompt covers them all. */
export function scriptFor(name) {
  const names = Array.isArray(name) ? name : [name];
  if (!names.length || names.length > 4 || names.some(item => !Object.hasOwn(BODIES, item))) throw new Error('Unknown virtual disk operation.');
  if (names.length === 1) return wrap(BODIES[names[0]]);
  return wrap(names.map((item, index) => '$s' + index + '=& {' + BODIES[item] + '};').join('') + '@{steps=@(' + names.map((_, index) => '$s' + index).join(',') + ')}');
}

/** Substitute the parameter block and encode for powershell.exe -EncodedCommand (UTF-16LE base64). */
export function encodeCommand(name, params) {
  const json = Buffer.from(JSON.stringify(params ?? {}), 'utf8').toString('base64');
  const script = scriptFor(name).replace('{{PARAMS}}', json);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  if (encoded.length > 30000) throw new Error('The request is too large to run.');
  return encoded;
}

/**
 * A human-readable PowerShell and DiskPart equivalent for the person to copy. It is documentation of what the manager runs,
 * with every caller value quoted, and it is never executed by the manager.
 */
export function equivalentScript(op, params, route = 'storage') {
  const q = value => "'" + String(value).replace(/'/g, "''") + "'";
  const mb = bytes => Math.round(bytes / 1048576);
  const lines = [];
  const diskpart = [];
  switch (op) {
    case 'create':
      if (route === 'diskpart') diskpart.push('create vdisk file="' + params.path + '" maximum=' + mb(params.sizeBytes) + ' type=' + (params.type === 'fixed' ? 'fixed' : 'expandable'));
      else lines.push('New-VHD -Path ' + q(params.path) + ' -SizeBytes ' + params.sizeBytes + (params.type === 'fixed' ? ' -Fixed' : ' -Dynamic'));
      break;
    case 'attach': lines.push('Mount-DiskImage -ImagePath ' + q(params.path) + ' -Access ' + (params.readOnly ? 'ReadOnly' : 'ReadWrite')); diskpart.push('select vdisk file="' + params.path + '"', 'attach vdisk' + (params.readOnly ? ' readonly' : '')); break;
    case 'mountIso': lines.push('Mount-DiskImage -ImagePath ' + q(params.path) + ' -StorageType ISO -Access ReadOnly'); break;
    case 'detach': lines.push('Dismount-DiskImage -ImagePath ' + q(params.path)); diskpart.push('select vdisk file="' + params.path + '"', 'detach vdisk'); break;
    case 'resize':
      if (route === 'diskpart') diskpart.push('select vdisk file="' + params.path + '"', 'expand vdisk maximum=' + mb(params.sizeBytes));
      else lines.push('Resize-VHD -Path ' + q(params.path) + ' -SizeBytes ' + params.sizeBytes);
      break;
    case 'compact':
      if (route === 'diskpart') diskpart.push('select vdisk file="' + params.path + '"', 'attach vdisk readonly', 'compact vdisk', 'detach vdisk');
      else lines.push('Optimize-VHD -Path ' + q(params.path) + ' -Mode ' + (COMPACT_MODES.includes(params.mode) ? params.mode : 'Full'));
      break;
    case 'convert': lines.push('Convert-VHD -Path ' + q(params.path) + ' -DestinationPath ' + q(params.destination) + ' -VHDType ' + (params.type === 'fixed' ? 'Fixed' : 'Dynamic')); break;
    default: throw new Error('Unknown virtual disk operation.');
  }
  return {powershell: lines.join('\n'), diskpart: diskpart.join('\n')};
}
