param([Parameter(Mandatory)][string]$Setup,[Parameter(Mandatory)][string]$VendorSetup,[Parameter(Mandatory)][string]$Icon,[switch]$CheckOnly)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$target=[IO.Path]::GetFullPath($Setup);$original=[IO.Path]::GetFullPath($VendorSetup)
if($target -eq $original){throw 'SETUP_RESOURCE_TARGET_IS_VENDOR'}
if((Get-AuthenticodeSignature -LiteralPath $target).Status -ne 'NotSigned'){throw 'SETUP_RESOURCE_TARGET_MUST_BE_UNSIGNED'}
if(-not ('SquirrelSetupResources.Repair' -as [type])){
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
namespace SquirrelSetupResources {
 public static class Repair {
  delegate bool NameCallback(IntPtr m,IntPtr t,IntPtr n,IntPtr p);
  delegate bool LanguageCallback(IntPtr m,IntPtr t,IntPtr n,ushort l,IntPtr p);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr LoadLibraryEx(string f,IntPtr h,uint flags);
  [DllImport("kernel32.dll")] static extern bool FreeLibrary(IntPtr m);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool EnumResourceNames(IntPtr m,IntPtr t,NameCallback cb,IntPtr p);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern bool EnumResourceLanguages(IntPtr m,IntPtr t,IntPtr n,LanguageCallback cb,IntPtr p);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindResourceEx(IntPtr m,IntPtr t,IntPtr n,ushort l);
  [DllImport("kernel32.dll",EntryPoint="FindResourceExW",CharSet=CharSet.Unicode)] static extern IntPtr FindNamedResource(IntPtr m,string t,IntPtr n,ushort l);
  [DllImport("kernel32.dll")] static extern uint SizeofResource(IntPtr m,IntPtr r);
  [DllImport("kernel32.dll")] static extern IntPtr LoadResource(IntPtr m,IntPtr r);
  [DllImport("kernel32.dll")] static extern IntPtr LockResource(IntPtr r);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr BeginUpdateResource(string f,bool delete);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool UpdateResource(IntPtr h,IntPtr t,IntPtr n,ushort l,byte[] b,uint count);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool EndUpdateResource(IntPtr h,bool discard);
  sealed class Row {public int Id;public ushort Language;public byte[] Bytes; public string Key{get{return Id+"/"+Language;}}}
  static Exception Bad(string message){return new InvalidDataException(message);}
  static List<Row> Rows(string file,int type){
   IntPtr m=LoadLibraryEx(file,IntPtr.Zero,0x22);if(m==IntPtr.Zero)throw Bad("SETUP_RESOURCE_READ_FAILED");
   var rows=new List<Row>();Exception error=null;
   try{
    NameCallback names=delegate(IntPtr module,IntPtr t,IntPtr n,IntPtr p){
     if(n.ToInt64()<1||n.ToInt64()>65535){error=Bad("SETUP_NAMED_ICON_UNSUPPORTED");return false;}
     LanguageCallback languages=delegate(IntPtr mm,IntPtr tt,IntPtr nn,ushort l,IntPtr pp){
      try{IntPtr r=FindResourceEx(mm,tt,nn,l);uint size=SizeofResource(mm,r);if(size<1||size>4194304)throw Bad("SETUP_ICON_RESOURCE_SIZE");
       IntPtr data=LockResource(LoadResource(mm,r));if(data==IntPtr.Zero)throw Bad("SETUP_ICON_RESOURCE_MISSING");
       byte[] bytes=new byte[size];Marshal.Copy(data,bytes,0,(int)size);rows.Add(new Row{Id=(int)nn,Language=l,Bytes=bytes});return true;
      }catch(Exception e){error=e;return false;}
     };
     bool ok=EnumResourceLanguages(module,t,n,languages,IntPtr.Zero);GC.KeepAlive(languages);if(!ok&&error==null)error=Bad("SETUP_ICON_LANGUAGE_MISSING");return ok;
    };
    bool result=EnumResourceNames(m,new IntPtr(type),names,IntPtr.Zero);GC.KeepAlive(names);
    if(error!=null)throw error;if(!result)throw Bad("SETUP_ICON_NAMES_MISSING");return rows;
   }finally{FreeLibrary(m);}
  }
  static string DataHash(string file){
   IntPtr m=LoadLibraryEx(file,IntPtr.Zero,0x22);if(m==IntPtr.Zero)throw Bad("SETUP_DATA_READ_FAILED");
   try{IntPtr r=FindNamedResource(m,"DATA",new IntPtr(131),1033);uint size=SizeofResource(m,r);if(size<22||size>1500000000)throw Bad("SETUP_DATA_SIZE");
    IntPtr data=LockResource(LoadResource(m,r));if(data==IntPtr.Zero)throw Bad("SETUP_DATA_MISSING");
    using(var hash=SHA256.Create()){byte[] chunk=new byte[1048576];for(long offset=0;offset<size;offset+=chunk.Length){int length=(int)Math.Min(chunk.Length,size-offset);Marshal.Copy(new IntPtr(data.ToInt64()+offset),chunk,0,length);hash.TransformBlock(chunk,0,length,null,0);}hash.TransformFinalBlock(new byte[0],0,0);return BitConverter.ToString(hash.Hash);}
   }finally{FreeLibrary(m);}
  }
  static int Count(Row group){var b=group.Bytes;if(b.Length<6||BitConverter.ToUInt16(b,0)!=0||BitConverter.ToUInt16(b,2)!=1)throw Bad("SETUP_GROUP_HEADER");int count=BitConverter.ToUInt16(b,4);if(count<1||count>256||b.Length!=6+14*count)throw Bad("SETUP_GROUP_SIZE");return count;}
  static Row Image(List<Row> images,Row group,int i){int id=BitConverter.ToUInt16(group.Bytes,6+14*i+12);var matches=images.Where(r=>r.Id==id&&r.Language==group.Language).ToArray();if(matches.Length!=1)throw Bad("SETUP_FRAME_MISSING");return matches[0];}
  static void Same(byte[] a,byte[] b){if(!a.SequenceEqual(b))throw Bad("SETUP_ICON_RESOURCE_MISMATCH");}
  static void Validate(List<Row> groups,List<Row> images,List<Row> originalGroups,List<Row> originalImages,byte[] ico){
   var expected=originalGroups.Select(r=>r.Key).Concat(groups.Where(r=>r.Id==1).Select(r=>r.Key)).OrderBy(k=>k).ToArray();
   if(!groups.Select(r=>r.Key).OrderBy(k=>k).SequenceEqual(expected)||groups.Count(r=>r.Id==1)!=1)throw Bad("SETUP_GROUP_SET_MISMATCH");
   foreach(var group in groups){int count=Count(group);
    if(group.Id==1){if(count!=9)throw Bad("SETUP_PRIMARY_FRAME_COUNT");for(int i=0;i<count;i++){int p=6+16*i,q=6+14*i;Same(ico.Skip(p).Take(12).ToArray(),group.Bytes.Skip(q).Take(12).ToArray());int length=checked((int)BitConverter.ToUInt32(ico,p+8)),offset=checked((int)BitConverter.ToUInt32(ico,p+12));Same(ico.Skip(offset).Take(length).ToArray(),Image(images,group,i).Bytes);}}
    else{var original=originalGroups.Single(r=>r.Key==group.Key);Same(group.Bytes,original.Bytes);for(int i=0;i<count;i++){var actual=Image(images,group,i);Same(actual.Bytes,Image(originalImages,original,i).Bytes);if(BitConverter.ToUInt32(group.Bytes,6+14*i+8)!=actual.Bytes.Length)throw Bad("SETUP_AUXILIARY_LENGTH_MISMATCH");}}
   }
  }
  static void Write(IntPtr h,int type,Row row){if(!UpdateResource(h,new IntPtr(type),new IntPtr(row.Id),row.Language,row.Bytes,(uint)row.Bytes.Length))throw Bad("SETUP_RESOURCE_WRITE_FAILED");}
  public static string Run(string file,string pristine,string icon,bool checkOnly){
   byte[] ico=File.ReadAllBytes(icon);if(ico.Length<150||BitConverter.ToUInt16(ico,0)!=0||BitConverter.ToUInt16(ico,2)!=1||BitConverter.ToUInt16(ico,4)!=9)throw Bad("SETUP_APPROVED_ICON_INVALID");
   var originalGroups=Rows(pristine,14);var originalImages=Rows(pristine,3);var groups=Rows(file,14);var images=Rows(file,3);
   if(!originalGroups.Select(r=>r.Id).OrderBy(i=>i).SequenceEqual(new int[]{107,108}))throw Bad("SETUP_VENDOR_GROUP_SET_CHANGED");
   string before=DataHash(file);
   if(checkOnly){Validate(groups,images,originalGroups,originalImages,ico);return before;}
   var primary=groups.Where(r=>r.Id==1).ToArray();if(primary.Length!=1||groups.Count!=originalGroups.Count+1||originalGroups.Any(o=>!groups.Any(g=>g.Key==o.Key)))throw Bad("SETUP_GROUP_SET_MISMATCH");
   var used=new HashSet<int>(images.Concat(originalImages).Select(r=>r.Id));var replacements=new List<Row>();
   byte[] groupBytes=new byte[6+14*9];Array.Copy(ico,groupBytes,6);int next=1;
   for(int i=0;i<9;i++){while(used.Contains(next)&&next<=65535)next++;if(next>65535)throw Bad("SETUP_ICON_IDS_EXHAUSTED");used.Add(next);
    int p=6+16*i,q=6+14*i;uint length=BitConverter.ToUInt32(ico,p+8),offset=BitConverter.ToUInt32(ico,p+12);if(length==0||length>4194304||(long)offset+length>ico.Length)throw Bad("SETUP_APPROVED_FRAME_BOUNDS");
    Array.Copy(ico,p,groupBytes,q,12);Array.Copy(BitConverter.GetBytes((ushort)next),0,groupBytes,q+12,2);
    replacements.Add(new Row{Id=next,Language=primary[0].Language,Bytes=ico.Skip((int)offset).Take((int)length).ToArray()});next++;
   }
   // Keep a complete pre-repair file next to the task-owned target for recovery.
   File.Copy(file,file+".before-icon-repair-"+Guid.NewGuid().ToString("N"));
   IntPtr update=BeginUpdateResource(file,false);if(update==IntPtr.Zero)throw Bad("SETUP_RESOURCE_UPDATE_FAILED");bool committed=false;
   try{foreach(var image in replacements)Write(update,3,image);foreach(var original in originalGroups){for(int i=0;i<Count(original);i++)Write(update,3,Image(originalImages,original,i));Write(update,14,original);}Write(update,14,new Row{Id=1,Language=primary[0].Language,Bytes=groupBytes});
    if(!EndUpdateResource(update,false))throw Bad("SETUP_RESOURCE_COMMIT_FAILED");committed=true;
   }finally{if(!committed)EndUpdateResource(update,true);}
   string after=DataHash(file);if(before!=after)throw Bad("SETUP_EMBEDDED_DATA_CHANGED");Validate(Rows(file,14),Rows(file,3),originalGroups,originalImages,ico);return after;
  }
 }
}
"@
}
$payloadHash=[SquirrelSetupResources.Repair]::Run($target,$original,[IO.Path]::GetFullPath($Icon),[bool]$CheckOnly)
if((Get-AuthenticodeSignature -LiteralPath $target).Status -ne 'NotSigned'){throw 'SETUP_RESOURCE_RESULT_MUST_BE_UNSIGNED'}
[pscustomobject]@{passed=$true;payloadSha256=$payloadHash.Replace('-','').ToLowerInvariant();auxiliaryGroupsPreserved=@(107,108);primaryFrames=9;installedLifecycleVerified=$false}
