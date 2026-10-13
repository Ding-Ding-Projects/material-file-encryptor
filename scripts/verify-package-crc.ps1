param([Parameter(Mandatory=$true)][string]$PackageDirectory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -ReferencedAssemblies System.IO.Compression,System.IO.Compression.FileSystem -TypeDefinition @"
using System;
using System.IO;
using System.IO.Compression;
using System.Collections.Generic;
using System.Text;
public static class PackageCrcVerifier {
  static readonly uint[] Table = MakeTable();
  static uint[] MakeTable() { var t=new uint[256]; for(uint i=0;i<256;i++){uint c=i;for(int j=0;j<8;j++)c=(c&1)!=0?0xedb88320U^(c>>1):c>>1;t[i]=c;}return t; }
  public static int Verify(string path) {
    var expected=new Dictionary<string,uint>(StringComparer.Ordinal);
    var decodedNames=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    using(var file=File.OpenRead(path)) using(var reader=new BinaryReader(file)) {
      long search=Math.Max(0,file.Length-65557), end=-1;
      for(long pos=file.Length-22;pos>=search;pos--){file.Position=pos;if(reader.ReadUInt32()==0x06054b50U){file.Position=pos+20;if(pos+22+reader.ReadUInt16()==file.Length){end=pos;break;}}}
      if(end<0)throw new InvalidDataException("ZIP end record missing.");
      file.Position=end+4;ushort disk=reader.ReadUInt16(),directoryDisk=reader.ReadUInt16(),onDisk=reader.ReadUInt16(),count=reader.ReadUInt16();uint size=reader.ReadUInt32(),offset=reader.ReadUInt32();
      if(disk!=0||directoryDisk!=0||count==65535||count!=onDisk||offset==uint.MaxValue||size==uint.MaxValue||(long)offset+size!=end)throw new InvalidDataException("Unsupported ZIP layout.");
      file.Position=offset;
      for(int i=0;i<count;i++) {
        if(reader.ReadUInt32()!=0x02014b50U)throw new InvalidDataException("ZIP directory entry invalid.");
        reader.ReadBytes(12);uint crc=reader.ReadUInt32();reader.ReadBytes(8);ushort nameLength=reader.ReadUInt16(),extra=reader.ReadUInt16(),comment=reader.ReadUInt16();reader.ReadBytes(8);uint localOffset=reader.ReadUInt32();
        string name=Encoding.UTF8.GetString(reader.ReadBytes(nameLength)); reader.ReadBytes(extra+comment);
        string decoded=Uri.UnescapeDataString(name).Replace('\\','/');
        if(decoded.StartsWith("/")||decoded.IndexOf(':')>=0||Array.IndexOf(decoded.Split('/'),"..")>=0||!decodedNames.Add(decoded))throw new InvalidDataException("Unsafe or duplicate ZIP entry.");
        expected.Add(name,crc);
        long resume=file.Position; file.Position=localOffset;
        if(reader.ReadUInt32()!=0x04034b50U)throw new InvalidDataException("ZIP local entry invalid.");
        reader.ReadUInt16();ushort flags=reader.ReadUInt16();reader.ReadBytes(6);uint localCrc=reader.ReadUInt32();
        if(((flags&8)==0||localCrc!=0)&&localCrc!=crc)throw new InvalidDataException("ZIP local CRC metadata mismatch.");
        file.Position=resume;
      }
      if(file.Position!=end)throw new InvalidDataException("ZIP directory size mismatch.");
    }
    using(var zip=ZipFile.OpenRead(path)) {
      if(zip.Entries.Count!=expected.Count)throw new InvalidDataException("ZIP entry inventory mismatch.");
      var buffer=new byte[65536];
      foreach(var entry in zip.Entries) {
        uint crc=uint.MaxValue;long length=0;
        using(var stream=entry.Open()){int n;while((n=stream.Read(buffer,0,buffer.Length))!=0){length+=n;for(int i=0;i<n;i++)crc=Table[(crc^buffer[i])&255]^(crc>>8);}}
        crc^=uint.MaxValue;
        if(length!=entry.Length||crc!=expected[entry.FullName])throw new InvalidDataException("Package CRC32 mismatch: "+entry.FullName);
      }
      return zip.Entries.Count;
    }
  }
}
"@
try {
 $packages=@(Get-ChildItem -LiteralPath $PackageDirectory -Filter '*.nupkg' -File)
 if (!$packages.Count) { throw 'No Squirrel packages to validate.' }
 $rows=@($packages | ForEach-Object { $count=[PackageCrcVerifier]::Verify($_.FullName); @{name=$_.Name; entries=$count; crc32Verified=$true; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()} })
 New-Item -ItemType Directory -Force out/evidence | Out-Null
 @{schemaVersion=1;passed=$true;packages=$rows} | ConvertTo-Json -Depth 6 | Set-Content out/evidence/package-crc.json -Encoding UTF8
 Write-Host "Verified complete CRC32 and byte lengths for $($packages.Count) Squirrel packages."
 exit 0
} catch {
 New-Item -ItemType Directory -Force out/evidence | Out-Null
 @{schemaVersion=1;passed=$false;failure='PACKAGE_CRC_VALIDATION_FAILED'} | ConvertTo-Json | Set-Content out/evidence/package-crc.json -Encoding UTF8
 Write-Error $_ -ErrorAction Continue
 exit 1
}
