function Assert-SquirrelIconResources {
  param([Parameter(Mandatory)][string]$Executable, [Parameter(Mandatory)][string]$Icon)
  if (-not ('SquirrelBranding.IconResources' -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
namespace SquirrelBranding {
  public static class IconResources {
    delegate bool EnumName(IntPtr module, IntPtr type, IntPtr name, IntPtr parameter);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern IntPtr LoadLibraryEx(string file, IntPtr fileHandle, uint flags);
    [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr module);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool EnumResourceNames(IntPtr module, IntPtr type, EnumName callback, IntPtr parameter);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr FindResource(IntPtr module, IntPtr name, IntPtr type);
    [DllImport("kernel32.dll")] static extern uint SizeofResource(IntPtr module, IntPtr resource);
    [DllImport("kernel32.dll")] static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
    [DllImport("kernel32.dll")] static extern IntPtr LockResource(IntPtr resource);
    static byte[] Read(IntPtr module, IntPtr type, IntPtr name) {
      IntPtr resource=FindResource(module,name,type); if(resource==IntPtr.Zero) return null;
      uint size=SizeofResource(module,resource); if(size==0 || size>4194304) return null;
      IntPtr data=LockResource(LoadResource(module,resource)); if(data==IntPtr.Zero)return null;
      byte[] bytes=new byte[size];Marshal.Copy(data,bytes,0,(int)size);return bytes;
    }
    static bool Equal(byte[] a,int offset,byte[] b,int count) {
      if(b==null||b.Length!=count||offset<0||offset>a.Length-count)return false;
      for(int i=0;i<count;i++)if(a[offset+i]!=b[i])return false;return true;
    }
    public static bool Matches(string executable,string icon) {
      byte[] ico=File.ReadAllBytes(icon);
      if(ico.Length<6||BitConverter.ToUInt16(ico,0)!=0||BitConverter.ToUInt16(ico,2)!=1)return false;
      int count=BitConverter.ToUInt16(ico,4);if(count!=9||ico.Length<6+16*count)return false;
      // Data/resource-only mapping never executes the candidate image or resolves its imports.
      IntPtr module=LoadLibraryEx(executable,IntPtr.Zero,0x22);if(module==IntPtr.Zero)return false;
      try {
        int groups=0;bool valid=true;
        EnumName callback=delegate(IntPtr m,IntPtr type,IntPtr name,IntPtr parameter) {
          groups++;byte[] group=Read(m,type,name);
          if(group==null||group.Length!=6+14*count||BitConverter.ToUInt16(group,0)!=0||BitConverter.ToUInt16(group,2)!=1||BitConverter.ToUInt16(group,4)!=count){valid=false;return true;}
          for(int i=0;i<count;i++) {
            int p=6+16*i,q=6+14*i;
            for(int j=0;j<12;j++)if(ico[p+j]!=group[q+j])valid=false;
            uint length=BitConverter.ToUInt32(ico,p+8),offset=BitConverter.ToUInt32(ico,p+12);
            if(length>4194304||offset>Int32.MaxValue||!Equal(ico,(int)offset,Read(m,new IntPtr(3),new IntPtr(BitConverter.ToUInt16(group,q+12))),(int)length))valid=false;
          }
          return true;
        };
        bool enumerated=EnumResourceNames(module,new IntPtr(14),callback,IntPtr.Zero);
        GC.KeepAlive(callback);return enumerated&&groups==1&&valid;
      } finally {FreeLibrary(module);}
    }
  }
}
"@
  }
  if (![SquirrelBranding.IconResources]::Matches([IO.Path]::GetFullPath($Executable),[IO.Path]::GetFullPath($Icon))) { throw 'SQUIRREL_UPDATER_ICON_MISMATCH' }
}

function Copy-SquirrelBrandedVendor {
  param([Parameter(Mandatory)][string]$Package, [Parameter(Mandatory)][string]$Icon,
    [Parameter(Mandatory)][string]$VendorDirectory, [Parameter(Mandatory)][string]$Destination)
  if (Test-Path -LiteralPath $Destination) { throw 'SQUIRREL_BRANDED_VENDOR_EXISTS' }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($Package))
  $temporary = Join-Path ([IO.Path]::GetTempPath()) ('mfe-branded-updater-' + [Guid]::NewGuid().ToString('N') + '.exe')
  try {
    # NuGet lowercases this filename. Reject duplicate case variants as well.
    $entries = @($zip.Entries | Where-Object { $_.FullName -match '^lib/[^/]+/squirrel\.exe$' })
    if ($entries.Count -ne 1) { throw 'SQUIRREL_PACKAGE_UPDATER_REQUIRED' }
    if ($entries[0].Length -lt 1 -or $entries[0].Length -gt 33554432) { throw 'SQUIRREL_PACKAGE_UPDATER_SIZE' }
    $stream=$entries[0].Open();$hasher=[Security.Cryptography.SHA256]::Create()
    try { $expected=([BitConverter]::ToString($hasher.ComputeHash($stream))).Replace('-','').ToLowerInvariant() }
    finally {$hasher.Dispose();$stream.Dispose()}
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0],$temporary)
    if ((Get-Item -LiteralPath $temporary).Length -ne $entries[0].Length -or (Get-SquirrelFileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected) { throw 'SQUIRREL_PACKAGE_UPDATER_MISMATCH' }
    Assert-SquirrelIconResources -Executable $temporary -Icon $Icon
    # Releasify embeds its own executing assembly. Preserve pristine vendor tools
    # and use the verified updater from the maker package after its temp tree is gone.
    Copy-Item -LiteralPath $VendorDirectory -Destination $Destination -Recurse
    $staged=Join-Path $Destination 'Squirrel.exe'
    Copy-Item -LiteralPath $temporary -Destination $staged -Force
    if ((Get-SquirrelFileHash -LiteralPath $staged -Algorithm SHA256).Hash.ToLowerInvariant() -cne $expected) { throw 'SQUIRREL_BRANDED_VENDOR_MISMATCH' }
    return $staged
  } finally {
    $zip.Dispose()
    if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}
  }
}
