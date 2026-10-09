using System.Security.Cryptography;
using System.Text;
using MaterialFileEncryptor.Core;

var cases = new (string,Action)[] {
    ("metadata discovery never hydrates advertised encrypted chunks",LazyDiscovery),
    ("history restore replaces same logical file and idle timer is inert",HistoryCurrentRestore),
    ("history missing content is unavailable and restore fails closed",MissingHistory),
    ("recycled subtree conflict restores under one new root",SubtreeRestore),
    ("legacy format remains readable and copy upgrades safely",Legacy),
    ("copy upgrade preserves original and recoverable history",CopyUpgrade),
    ("version history, quiet saves and recycle persistence",History),
    ("format 2 independent hash blobs and unchanged chunk reuse",FixedChunks),
    ("random access, sparse growth, truncate, atomic rename and stable handles",RandomAccess),
    ("credential wrapping, key file and raw master restore",Credentials),
    ("case folding, traversal and Windows reserved names",Paths),
    ("physical ciphertext caps, packed records and explicit resplit",Caps),
    ("authenticated record tamper is rejected",Tamper),
    ("offline pin, dirty journal recovery and queued publication",Offline),
    ("independent devices preserve concurrent file edits",Conflicts),
    ("incomplete incoming version preserves last usable view",Incomplete),
    ("pinned, open and dirty ciphertext cannot be evicted",Eviction),
    ("concurrent directory deletion preserves visible descendant edits",DirectoryConflict),
    ("remote deletion retains open-handle content",RemoteOpen),
    ("root and managed-child symbolic links are rejected",Links),
    ("folder pin inheritance and sparse terabyte lengths",FolderPin),
    ("targeted release removes only selected clean cache parts",TargetedRelease),
    ("targeted release protects pins, open, dirty, pending and offline state",TargetedProtection),
    ("targeted release preserves shared and orphaned ciphertext",TargetedShared),
    ("targeted release authenticates source before deleting cache",TargetedAuthentication),
};
if(args.Length==2 && args[0]=="crash-write") {
    var options=Options(args[1]); using var c=VaultCredentials.Password("strong test credential"); var v=VaultEngine.Open(options,c);
    v.CreateFile("recovered.txt");v.WriteRange("recovered.txt",0,Encoding.UTF8.GetBytes("journal survives abrupt termination"));v.FlushAsync().GetAwaiter().GetResult();
    Environment.Exit(0);
}
var failed=0;
if(args.Length==2 && args[0]=="filter") cases=cases.Where(c=>c.Item1.Contains(args[1],StringComparison.OrdinalIgnoreCase)).ToArray();
foreach(var (name,test) in cases) {try {test();Console.WriteLine("PASS "+name);}catch(Exception e){failed++;Console.Error.WriteLine("FAIL "+name+": "+e);}}
Console.WriteLine($"{cases.Length-failed}/{cases.Length} checks passed");
return failed==0?0:1;

static VaultOptions Options(string root,string cache="cache",long cap=1024) => new() { StorageRoot=Path.Combine(root,"source"),CacheRoot=Path.Combine(root,cache),PartSizeBytes=cap };
static void Assert(bool result,string message="Assertion failed") {if(!result)throw new Exception(message);}
static void Equal(byte[] expected,byte[] actual) => Assert(expected.SequenceEqual(actual),"Bytes differ.");
static void Throws<T>(Action action) where T:Exception {try{action();}catch(T){return;}throw new Exception("Expected "+typeof(T).Name);}
static string Temp() {var p=Path.Combine(Path.GetTempPath(),"mfe-tests-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(p);return p;}
static VaultEngine Create(string root,long cap=1024) {using var c=VaultCredentials.Password("strong test credential");return VaultEngine.Create(Options(root,cap:cap),c);}
static VaultEngine Open(string root,string cache="cache") {using var c=VaultCredentials.Password("strong test credential");return VaultEngine.Open(Options(root,cache),c);}
static byte[] Read(VaultEngine v,string path) {var bytes=new byte[v.GetInfo(path)!.Length];Assert(v.ReadRange(path,0,bytes)==bytes.Length);return bytes;}
static void RandomAccess() {
    var root=Temp();try {using var v=Create(root);v.CreateDirectory("docs");v.CreateFile("docs/a.txt");var a=RandomNumberGenerator.GetBytes(12000);v.WriteRange("docs/a.txt",0,a);Equal(a,Read(v,"DOCS/A.TXT"));
        var patch=Encoding.UTF8.GetBytes("offset patch");v.WriteRange("docs/a.txt",981,patch);patch.CopyTo(a,981);Equal(a,Read(v,"docs/a.txt"));
        v.SetLength("docs/a.txt",15000);var extended=Read(v,"docs/a.txt");Equal(a,extended[..a.Length]);Assert(extended[a.Length..].All(b=>b==0));
        v.SetLength("docs/a.txt",997);v.SetLength("docs/a.txt",1100);Assert(Read(v,"docs/a.txt")[997..].All(b=>b==0),"Truncated bytes reappeared.");
        v.CreateFile("docs/b.txt");v.WriteRange("docs/b.txt",0,"old destination"u8);var id=v.GetInfo("docs/b.txt")!.EntryId;using var lease=v.AcquireOpenById(id);v.Rename("docs/a.txt","docs/b.txt",true);var old=new byte[15];Assert(v.ReadRangeById(id,0,old)==15);Equal("old destination"u8.ToArray(),old);Assert(v.GetInfo("docs/a.txt")==null);v.FlushAsync().GetAwaiter().GetResult();
        using var restored=Open(root,"second");Assert(restored.GetInfo("docs/b.txt")!.Length==1100);Assert(restored.GetInfoById(restored.VaultId).IsDirectory);using var rootLease=restored.AcquireOpenById(restored.VaultId);
        v.Rename("docs","DOCS",false);v.FlushAsync().GetAwaiter().GetResult();using var again=Open(root,"third");Assert(again.Enumerate("").Single().Name=="DOCS","Local "+v.Enumerate("").Single().Name+" remote "+again.Enumerate("").Single().Name);
    } finally{Directory.Delete(root,true);}}
static void Credentials() {
    var root=Temp();try {byte[] master;using(var v=Create(root)){v.CreateFile("secret-name.txt");v.WriteRange("secret-name.txt",0,"secret plaintext marker"u8);v.FlushAsync().GetAwaiter().GetResult();master=v.ExportMasterKey();}
        using(var c=VaultCredentials.Password("wrong"))Throws<CryptographicException>(()=>VaultEngine.Open(Options(root),c));
        using(var v=VaultEngine.OpenWithMasterKey(Options(root,"master"),master))Equal("secret plaintext marker"u8.ToArray(),Read(v,"secret-name.txt"));
        Throws<CryptographicException>(()=>VaultEngine.OpenWithMasterKey(Options(root,"bad-master"),RandomNumberGenerator.GetBytes(32)));
        foreach(var file in Directory.EnumerateFiles(root,"*",SearchOption.AllDirectories)) {var raw=File.ReadAllBytes(file);Assert(!Encoding.UTF8.GetString(raw).Contains("secret-name.txt")&&!Encoding.UTF8.GetString(raw).Contains("secret plaintext marker"),"Plaintext leaked to filesystem.");}
        var keyRoot=Path.Combine(root,"keyvault");var bytes=VaultCredentials.GenerateKeyFile();using var cred=VaultCredentials.KeyFile(bytes);using(var v=VaultEngine.Create(Options(keyRoot),cred)){v.CreateFile("key.bin");v.FlushAsync().GetAwaiter().GetResult();}using var opened=VaultEngine.Open(Options(keyRoot),cred);Assert(opened.GetInfo("key.bin")!=null);Throws<ArgumentException>(()=>VaultCredentials.KeyFile(new byte[31]));
    } finally{Directory.Delete(root,true);}}
static void Paths() {foreach(var path in new[]{"../a","a/../b","a//b","C:/a","con.txt","LPT1","com².dat","a.","a ","a?b","//server/a"})Throws<ArgumentException>(()=>VaultPath.Normalize(path));Assert(VaultPath.Normalize("\\docs\\a")=="docs/a");var root=Temp();try{using var v=Create(root);v.CreateFile("Readme.txt");Throws<IOException>(()=>v.CreateFile("README.TXT"));}finally{Directory.Delete(root,true);}}
static void Caps() {var root=Temp();try{using var v=Create(root,140000);v.CreateFile("cap.bin");var bytes=RandomNumberGenerator.GetBytes(300000);v.WriteRange("cap.bin",0,bytes);v.FlushAsync().GetAwaiter().GetResult();Assert(v.GetInfo("cap.bin")!.PartCount<5,"Records were not packed.");foreach(var p in Directory.EnumerateFiles(Path.Combine(root,"source","parts")))Assert(new FileInfo(p).Length<=140000);v.SetPartSize(1024);Assert(v.GetInfo("cap.bin")!.PartSizeBytes==140000);v.WriteRange("cap.bin",0,new byte[]{42});bytes[0]=42;Assert(v.GetInfo("cap.bin")!.PartSizeBytes==1024);v.FlushAsync().GetAwaiter().GetResult();Equal(bytes,Read(v,"cap.bin"));var prior=Directory.GetFiles(Path.Combine(root,"source","parts")).Length;v.ResplitAsync("cap.bin",4096).GetAwaiter().GetResult();Assert(v.GetInfo("cap.bin")!.PartSizeBytes==4096);Equal(bytes,Read(v,"cap.bin"));Assert(Directory.GetFiles(Path.Combine(root,"source","parts")).Length>prior,"Previous objects were deleted.");foreach(var p in Directory.EnumerateFiles(Path.Combine(root,"source","parts")))Assert(new FileInfo(p).Length<=140000);Throws<ArgumentOutOfRangeException>(()=>v.SetPartSize(1023));Throws<ArgumentOutOfRangeException>(()=>v.SetPartSize(1073741825));}finally{Directory.Delete(root,true);}}
static void Tamper() {var root=Temp();try{using var v=Create(root);v.CreateFile("t.bin");v.WriteRange("t.bin",0,RandomNumberGenerator.GetBytes(2000));v.FlushAsync().GetAwaiter().GetResult();foreach(var p in Directory.EnumerateFiles(Path.Combine(root,"cache","parts"))){var bytes=File.ReadAllBytes(p);bytes[^1]^=1;File.WriteAllBytes(p,bytes);}Assert(Read(v,"t.bin").Length==2000,"Clean cache did not recover from authenticated source."); foreach(var folder in new[]{"cache","source"})foreach(var p in Directory.EnumerateFiles(Path.Combine(root,folder,"parts"))){var bytes=File.ReadAllBytes(p);bytes[^1]^=1;File.WriteAllBytes(p,bytes);} Throws<CryptographicException>(()=>Read(v,"t.bin"));}finally{Directory.Delete(root,true);}}
static void Offline() {var root=Temp();try{using(var v=Create(root)){v.CreateFile("offline.txt");v.WriteRange("offline.txt",0,"available offline"u8);v.FlushAsync().GetAwaiter().GetResult();v.SetPinnedAsync("offline.txt",true).GetAwaiter().GetResult();}Directory.Move(Path.Combine(root,"source"),Path.Combine(root,"away"));
        var executable=Environment.ProcessPath!;var assembly=System.Reflection.Assembly.GetExecutingAssembly().Location;var psi=new System.Diagnostics.ProcessStartInfo(executable){UseShellExecute=false};if(Path.GetFileNameWithoutExtension(executable)=="dotnet")psi.ArgumentList.Add(assembly);psi.ArgumentList.Add("crash-write");psi.ArgumentList.Add(root);using(var child=System.Diagnostics.Process.Start(psi)!){child.WaitForExit();Assert(child.ExitCode==0);}
        using(var v=Open(root)){Equal("available offline"u8.ToArray(),Read(v,"offline.txt"));Equal("journal survives abrupt termination"u8.ToArray(),Read(v,"recovered.txt"));Assert(v.Status.PendingCommits>0&&!v.Status.IsSourceAvailable);Directory.Move(Path.Combine(root,"away"),Path.Combine(root,"source"));v.SyncAsync().GetAwaiter().GetResult();Assert(v.Status.PendingCommits==0&&v.Status.IsSourceAvailable);}using var remote=Open(root,"remote");Assert(remote.GetInfo("recovered.txt")!=null);
    }finally{Directory.Delete(root,true);}}
static void Conflicts() {var root=Temp();try{using(var initial=Create(root)){initial.CreateFile("shared.txt");initial.WriteRange("shared.txt",0,"base"u8);initial.FlushAsync().GetAwaiter().GetResult();}using var a=Open(root,"a");using var b=Open(root,"b");a.WriteRange("shared.txt",0,"AAAA"u8);b.WriteRange("shared.txt",0,"BBBB"u8);a.FlushAsync().GetAwaiter().GetResult();b.FlushAsync().GetAwaiter().GetResult();a.SyncAsync().GetAwaiter().GetResult();b.SyncAsync().GetAwaiter().GetResult();var views=a.Enumerate("").Select(i=>Encoding.UTF8.GetString(Read(a,i.Path))).Order().ToArray();Assert(views.SequenceEqual(new[]{"AAAA","BBBB"}));Assert(a.Enumerate("").Select(x=>x.Path).SequenceEqual(b.Enumerate("").Select(x=>x.Path)),"Devices diverged."); Assert(a.Enumerate("").Select(x=>x.EntryId).Distinct().Count()==2,"Conflicts share a handle identity."); foreach(var info in a.Enumerate("")){var bytes=new byte[4];Assert(a.ReadRangeById(info.EntryId,0,bytes)==4);Equal(Read(a,info.Path),bytes);}}finally{Directory.Delete(root,true);}}
static void Incomplete() {var root=Temp();try{using(var initial=Create(root)){initial.CreateFile("version.txt");initial.WriteRange("version.txt",0,"old"u8);initial.FlushAsync().GetAwaiter().GetResult();}using var reader=Open(root,"reader");var oldParts=Directory.GetFiles(Path.Combine(root,"source","parts")).ToHashSet();using(var writer=Open(root,"writer")){writer.WriteRange("version.txt",0,"new version"u8);writer.FlushAsync().GetAwaiter().GetResult();}var newest=Directory.GetFiles(Path.Combine(root,"source","parts")).Single(p=>!oldParts.Contains(p));var held=newest+".held";File.Move(newest,held);reader.SyncAsync().GetAwaiter().GetResult();Equal("old"u8.ToArray(),Read(reader,"version.txt"));Assert(reader.Status.PendingIncomingCommits>0);File.Move(held,newest);reader.SyncAsync().GetAwaiter().GetResult();Equal("new version"u8.ToArray(),Read(reader,"version.txt"));}finally{Directory.Delete(root,true);}}
static void Eviction() {var root=Temp();try{using var v=Create(root);v.CreateFile("pinned");v.WriteRange("pinned",0,"keep"u8);v.FlushAsync().GetAwaiter().GetResult();v.SetPinnedAsync("pinned",true).GetAwaiter().GetResult();Assert(v.EvictCache(long.MaxValue)==0);v.SetPinnedAsync("pinned",false).GetAwaiter().GetResult();using(var lease=v.AcquireOpen("pinned"))Assert(v.EvictCache(long.MaxValue)==0);v.WriteRange("pinned",0,"dirty"u8);Assert(v.EvictCache(long.MaxValue)>=0);Equal("dirty"u8.ToArray(),Read(v,"pinned"));v.FlushAsync().GetAwaiter().GetResult();Assert(v.EvictCache(long.MaxValue)>0);Equal("dirty"u8.ToArray(),Read(v,"pinned"));}finally{Directory.Delete(root,true);}}

static void DirectoryConflict() {var root=Temp();try{using(var initial=Create(root)){initial.CreateDirectory("d");initial.CreateFile("d/f");initial.WriteRange("d/f",0,"base"u8);initial.FlushAsync().GetAwaiter().GetResult();}using var a=Open(root,"a");using var b=Open(root,"b");a.Delete("d",true);b.WriteRange("d/f",0,"edit"u8);a.FlushAsync().GetAwaiter().GetResult();b.FlushAsync().GetAwaiter().GetResult();a.SyncAsync().GetAwaiter().GetResult();b.SyncAsync().GetAwaiter().GetResult();Assert(a.Enumerate("").Any(i=>i.Name=="d"),"Surviving edit parent is missing.");Equal("edit"u8.ToArray(),Read(a,"d/f"));Equal(Read(a,"d/f"),Read(b,"d/f"));}finally{Directory.Delete(root,true);}}
static void RemoteOpen() {var root=Temp();try{using(var initial=Create(root)){initial.CreateFile("open");initial.WriteRange("open",0,"open bytes"u8);initial.FlushAsync().GetAwaiter().GetResult();}using var a=Open(root,"a");using var b=Open(root,"b");var id=a.GetInfo("open")!.EntryId;using var lease=a.AcquireOpenById(id);b.Delete("open");b.FlushAsync().GetAwaiter().GetResult();a.SyncAsync().GetAwaiter().GetResult();Assert(a.GetInfo("open")==null);var bytes=new byte[10];Assert(a.ReadRangeById(id,0,bytes)==10);Equal("open bytes"u8.ToArray(),bytes);}finally{Directory.Delete(root,true);}}
static void Links() {var root=Temp();try{Directory.CreateDirectory(Path.Combine(root,"source"));Directory.CreateSymbolicLink(Path.Combine(root,"cache"),Path.Combine(root,"source"));Throws<ArgumentException>(()=>Create(root));Directory.Delete(Path.Combine(root,"cache"));Directory.CreateDirectory(Path.Combine(root,"cache"));Directory.CreateDirectory(Path.Combine(root,"source","parts"));Directory.CreateSymbolicLink(Path.Combine(root,"cache","parts"),Path.Combine(root,"source","parts"));Throws<ArgumentException>(()=>Create(root));}finally{Directory.Delete(root,true);}}
static void FolderPin() {var root=Temp();try{using var v=Create(root);v.CreateDirectory("p");v.SetPinnedAsync("p",true).GetAwaiter().GetResult();v.CreateFile("p/new");v.WriteRange("p/new",0,"pinned child"u8);v.SetLength("p/new",1L<<40);Assert(v.GetInfo("p/new")!.IsPinned);var tail=new byte[20];Assert(v.ReadRange("p/new",(1L<<40)-20,tail)==20);Assert(tail.All(b=>b==0));v.FlushAsync().GetAwaiter().GetResult();Assert(v.EvictCache(long.MaxValue)==0);v.SetPinnedAsync("p",false).GetAwaiter().GetResult();Assert(!v.GetInfo("p/new")!.IsPinned);}finally{Directory.Delete(root,true);}}

static HashSet<string> CachedParts(string root,string cache="cache") => Directory.GetFiles(Path.Combine(root,cache,"parts"),"*.mfe").ToHashSet(StringComparer.Ordinal);
static void TargetedRelease() {
    var root=Temp();try {
        using var v=Create(root);v.CreateDirectory("selected");v.CreateFile("selected/a");v.WriteRange("selected/a",0,RandomNumberGenerator.GetBytes(1300));v.CreateFile("selected/b");v.WriteRange("selected/b",0,"subtree"u8);
        var selected=CachedParts(root);var expectedBytes=selected.Sum(p=>new FileInfo(p).Length);
        v.CreateFile("unrelated");v.WriteRange("unrelated",0,"retain unrelated cached bytes"u8);v.FlushAsync().GetAwaiter().GetResult();
        var all=CachedParts(root);var unrelated=all.Except(selected).ToHashSet();var sourceParts=Directory.GetFiles(Path.Combine(root,"source","parts")).ToHashSet();var journal=File.ReadAllBytes(Path.Combine(root,"cache","journal.mfe"));
        v.SetPinnedAsync("selected",true).GetAwaiter().GetResult();Assert(v.EvictEntryCache("selected")==0);v.SetPinnedAsync("selected",false).GetAwaiter().GetResult();journal=File.ReadAllBytes(Path.Combine(root,"cache","journal.mfe"));
        Assert(v.EvictEntryCache("SELECTED")==expectedBytes,"Removed-byte count is not the selected ciphertext size.");Assert(CachedParts(root).SetEquals(unrelated),"Unrelated cache content was evicted.");
        Assert(Directory.GetFiles(Path.Combine(root,"source","parts")).ToHashSet().SetEquals(sourceParts),"Source ciphertext changed during cache release.");Equal(journal,File.ReadAllBytes(Path.Combine(root,"cache","journal.mfe")));Assert(v.GetInfo("selected/a")!.Length==1300);Equal("subtree"u8.ToArray(),Read(v,"selected/b"));
        Throws<FileNotFoundException>(()=>v.EvictEntryCache("absent"));Throws<ArgumentException>(()=>v.EvictEntryCache("../selected"));
    }finally{Directory.Delete(root,true);}
}
static void TargetedProtection() {
    var root=Temp();try {
        using var v=Create(root);v.CreateDirectory("p");v.CreateFile("p/file");v.WriteRange("p/file",0,RandomNumberGenerator.GetBytes(1300));v.FlushAsync().GetAwaiter().GetResult();
        v.SetPinnedAsync("p",true).GetAwaiter().GetResult();Assert(v.EvictEntryCache("p/file")==0,"An inherited folder pin was ignored.");v.SetPinnedAsync("p",false).GetAwaiter().GetResult();
        using(var lease=v.AcquireOpen("p/file"))Assert(v.EvictEntryCache("p/file")==0,"An open file was evicted.");
        v.WriteRange("p/file",0,"dirty"u8);var dirty=CachedParts(root);Assert(v.EvictEntryCache("p/file")==0,"Dirty file's unchanged published chunks were evicted.");Assert(CachedParts(root).SetEquals(dirty));
        Directory.Move(Path.Combine(root,"source"),Path.Combine(root,"away"));Assert(v.EvictEntryCache("p")==0,"Offline cache release returned removed bytes.");v.FlushAsync().GetAwaiter().GetResult();Assert(v.Status.PendingCommits>0);Assert(v.EvictEntryCache("p/file")==0);Assert(CachedParts(root).SetEquals(dirty));
        Directory.Move(Path.Combine(root,"away"),Path.Combine(root,"source"));Assert(v.EvictEntryCache("p/file")==0,"Unpublished commit chunks were evicted.");Assert(CachedParts(root).SetEquals(dirty));v.SyncAsync().GetAwaiter().GetResult();Assert(v.Status.PendingCommits==0);Assert(v.EvictEntryCache("p/file")>0);
    }finally{Directory.Delete(root,true);}
}
static void TargetedShared() {
    var root=Temp();try {
        using(var initial=Create(root)){initial.CreateFile("shared");initial.WriteRange("shared",0,RandomNumberGenerator.GetBytes(1500));initial.FlushAsync().GetAwaiter().GetResult();}
        using var a=Open(root,"a");using var b=Open(root,"b");a.WriteRange("shared",0,"AAAA"u8);b.WriteRange("shared",0,"BBBB"u8);a.FlushAsync().GetAwaiter().GetResult();b.FlushAsync().GetAwaiter().GetResult();a.SyncAsync().GetAwaiter().GetResult();
        var files=a.Enumerate("");Assert(files.Count==2);var target=files[0];var other=files[1];var before=CachedParts(root,"a");var otherBytes=Read(a,other.Path);var targetBytes=Read(a,target.Path);
        Assert(a.EvictEntryCache(target.Path)>0);var removed=before.Except(CachedParts(root,"a")).ToArray();Assert(removed.Length==1,"A shared part or unrelated historical part was evicted.");
        Equal(otherBytes,Read(a,other.Path));Assert(before.Except(CachedParts(root,"a")).SequenceEqual(removed),"Reading the other entry had to refetch its shared cache content.");Equal(targetBytes,Read(a,target.Path));
        using var lease=a.AcquireOpenById(other.EntryId);a.Delete(other.Path);a.FlushAsync().GetAwaiter().GetResult();var withOrphan=CachedParts(root,"a");Assert(a.EvictEntryCache(target.Path)>0);var after=CachedParts(root,"a");Assert(withOrphan.Except(after).Count()==1,"An orphaned open handle's shared part was evicted.");var openedBytes=new byte[other.Length];Assert(a.ReadRangeById(other.EntryId,0,openedBytes)==openedBytes.Length);Equal(otherBytes,openedBytes);Assert(CachedParts(root,"a").SetEquals(after),"Orphaned content had to be refetched after targeted release.");
    }finally{Directory.Delete(root,true);}
}
static void TargetedAuthentication() {
    var root=Temp();try {
        using var v=Create(root);v.CreateFile("verified");v.WriteRange("verified",0,RandomNumberGenerator.GetBytes(2000));v.FlushAsync().GetAwaiter().GetResult();var before=CachedParts(root);var sourcePart=Directory.GetFiles(Path.Combine(root,"source","parts")).Last();var bytes=File.ReadAllBytes(sourcePart);bytes[^1]^=1;File.WriteAllBytes(sourcePart,bytes);
        Throws<CryptographicException>(()=>v.EvictEntryCache("verified"));Assert(CachedParts(root).SetEquals(before),"Cache changed before all source copies authenticated.");Assert(Read(v,"verified").Length==2000);
    }finally{Directory.Delete(root,true);}
}

static void FixedChunks() {
    var root=Temp();try {using var v=Create(root,4096);v.CreateFile("a");v.CreateFile("b");var bytes=RandomNumberGenerator.GetBytes(9000);v.WriteRange("a",0,bytes);v.WriteRange("b",0,bytes);v.FlushAsync().GetAwaiter().GetResult();Assert(v.GetInfo("a")!.PartCount==3);var before=Directory.GetFiles(Path.Combine(root,"source","parts")).Select(Path.GetFileName).ToHashSet();Assert(before.Count==6);Assert(before.All(p=>p!.Length==68));v.WriteRange("a",4500,new byte[]{42});v.FlushAsync().GetAwaiter().GetResult();var after=Directory.GetFiles(Path.Combine(root,"source","parts"));Assert(after.Length==7,"Unchanged chunks were rewritten.");Assert(after.All(p=>new FileInfo(p).Length<=4096));Throws<ArgumentOutOfRangeException>(()=>v.SetPartSize(90000001));bytes[4500]=42;Equal(bytes,Read(v,"a"));}finally{Directory.Delete(root,true);}
}
static void History() {
    var root=Temp();try {using(var v=Create(root)){v.CreateDirectory("folder");v.CreateFile("folder/a");v.WriteRange("folder/a",0,"first"u8);v.SaveDueVersionsAsync(DateTimeOffset.UtcNow.AddSeconds(29)).GetAwaiter().GetResult();Assert(v.ListVersions().Count==0);v.SaveDueVersionsAsync(DateTimeOffset.UtcNow.AddSeconds(31)).GetAwaiter().GetResult();Assert(v.ListVersions().Count==1);var first=v.ListVersions().Single();v.WriteRange("folder/a",0,"later"u8);v.SaveVersionAsync("folder/a").GetAwaiter().GetResult();v.RestoreVersionAsync(first.Id).GetAwaiter().GetResult();Assert(v.Enumerate("folder").Count==1,"History restore must replace the same logical file.");Equal("first"u8.ToArray(),Read(v,"folder/a"));v.Delete("folder",true);v.FlushAsync().GetAwaiter().GetResult();Assert(v.ListDeleted().Count==2);var dir=v.ListDeleted().Single(x=>x.IsDirectory);v.RestoreDeletedAsync(new[]{dir.Id}).GetAwaiter().GetResult();Assert(v.GetInfo("folder/a")!=null);v.Delete("folder",true);v.FlushAsync().GetAwaiter().GetResult();v.EmptyRecycleBinAsync().GetAwaiter().GetResult();Assert(v.ListDeleted().Count==0);Assert(v.ListVersions().Any(x=>x.Deleted));}using var replica=Open(root,"replica");Assert(replica.ListDeleted().Count==0);Assert(replica.ListVersions().Any(x=>x.Deleted));}finally{Directory.Delete(root,true);}
}

static void CopyUpgrade() {
    var root=Temp();var dest=Temp();try{using var v=Create(root);v.CreateFile("original");v.WriteRange("original",0,"old bytes"u8);v.SaveVersionAsync().GetAwaiter().GetResult();var old=v.ListVersions().Single();v.WriteRange("original",0,"new bytes"u8);v.SaveVersionAsync().GetAwaiter().GetResult();using var credentials=VaultCredentials.Password("different upgrade credential");using(var upgraded=v.CopyUpgradeAsync(Options(dest),credentials).GetAwaiter().GetResult()){Equal("new bytes"u8.ToArray(),Read(upgraded,"original"));Assert(upgraded.ListVersions().Count==2);upgraded.RestoreVersionAsync(old.Id).GetAwaiter().GetResult();Assert(upgraded.Enumerate("").Count==1);Equal("old bytes"u8.ToArray(),Read(upgraded,"original"));}Equal("new bytes"u8.ToArray(),Read(v,"original"));using var second=VaultEngine.Open(Options(dest,"second"),credentials);Assert(second.ListVersions().Count==4);}finally{Directory.Delete(root,true);Directory.Delete(dest,true);}
}

static void Legacy() {
    var root=Temp();var dest=Temp();try{using(var v=Create(root)){}foreach(var folder in new[]{"source","cache"}){var config=Path.Combine(root,folder,"vault.json");var json=System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(config))!;json["Format"]=1;File.WriteAllText(config,json.ToJsonString());}using var legacy=Open(root);Assert(legacy.StorageFormat==1);legacy.CreateFile("v1");var bytes=RandomNumberGenerator.GetBytes(4000);legacy.WriteRange("v1",0,bytes);legacy.SaveVersionAsync().GetAwaiter().GetResult();using var cred=VaultCredentials.Password("upgrade credential");using var converted=legacy.CopyUpgradeAsync(Options(dest),cred).GetAwaiter().GetResult();Assert(converted.StorageFormat==2);Equal(bytes,Read(converted,"v1"));Equal(bytes,Read(legacy,"v1"));using var replica=Open(root,"legacyreplica");Equal(bytes,Read(replica,"v1"));}finally{Directory.Delete(root,true);Directory.Delete(dest,true);}
}

static void MissingHistory() {
    var root=Temp();try{using var v=Create(root);v.CreateFile("file");v.WriteRange("file",0,"bytes"u8);v.SaveVersionAsync().GetAwaiter().GetResult();var version=v.ListVersions().Single();foreach(var folder in new[]{"source","cache"})foreach(var path in Directory.GetFiles(Path.Combine(root,folder,"parts")))File.Delete(path);Assert(!v.ListVersions().Single().IsAvailable);Throws<IOException>(()=>v.RestoreVersionAsync(version.Id).GetAwaiter().GetResult());Assert(v.Enumerate("").Count==1);}finally{Directory.Delete(root,true);}
}
static void SubtreeRestore() {
    var root=Temp();try{using var v=Create(root);v.CreateDirectory("folder");v.CreateFile("folder/a");v.WriteRange("folder/a",0,"saved"u8);v.Delete("folder",true);var dir=v.ListDeleted().Single(x=>x.IsDirectory);v.CreateDirectory("folder");v.CreateFile("folder/occupied");v.RestoreDeletedAsync(new[]{dir.Id}).GetAwaiter().GetResult();var restored=v.Enumerate("").Single(x=>x.Name!="folder");Equal("saved"u8.ToArray(),Read(v,restored.Path+"/a"));Assert(v.GetInfo("folder/occupied")!=null);}finally{Directory.Delete(root,true);}
}

static void HistoryCurrentRestore() {
    var root=Temp();try{using var v=Create(root);v.CreateFile("file");var id=v.GetInfo("file")!.EntryId;v.WriteRange("file",0,"old bytes"u8);v.SaveVersionAsync("file").GetAwaiter().GetResult();var old=v.ListVersions(id).Single();v.WriteRange("file",0,"new bytes"u8);v.RestoreVersionAsync(old.Id).GetAwaiter().GetResult();Equal("old bytes"u8.ToArray(),Read(v,"file"));Assert(v.GetInfo("file")!.EntryId==id);Assert(v.Enumerate("").Count==1);var preserved=v.ListVersions(id).First(x=>x.Id!=old.Id&&x.Id!=v.ListVersions(id).First().Id);v.RestoreVersionAsync(preserved.Id).GetAwaiter().GetResult();Equal("new bytes"u8.ToArray(),Read(v,"file"));var files=Directory.GetFiles(root,"*",SearchOption.AllDirectories).ToDictionary(p=>p,p=>(File.GetLastWriteTimeUtc(p),File.ReadAllBytes(p)));var events=0;v.HistoryChanged+=()=>events++;v.SaveDueVersionsAsync(DateTimeOffset.UtcNow.AddDays(1)).GetAwaiter().GetResult();Assert(events==0);Assert(Directory.GetFiles(root,"*",SearchOption.AllDirectories).Length==files.Count);foreach(var pair in files){Assert(File.GetLastWriteTimeUtc(pair.Key)==pair.Value.Item1);Equal(pair.Value.Item2,File.ReadAllBytes(pair.Key));}}finally{Directory.Delete(root,true);}
}

static void LazyDiscovery() {
    var root=Temp();try{using(var writer=Create(root)){writer.CreateFile("a");writer.WriteRange("a",0,RandomNumberGenerator.GetBytes(2000));writer.SaveVersionAsync().GetAwaiter().GetResult();writer.CreateFile("b");writer.WriteRange("b",0,RandomNumberGenerator.GetBytes(2000));writer.SaveVersionAsync().GetAwaiter().GetResult();}var held=Path.Combine(root,"held");Directory.CreateDirectory(held);foreach(var path in Directory.GetFiles(Path.Combine(root,"source","parts")))File.Move(path,Path.Combine(held,Path.GetFileName(path)));using var reader=Open(root,"lazy");Assert(reader.Enumerate("").Count==0);var calls=0;reader.IsEncryptedFileAvailable=path=>File.Exists(Path.Combine(held,Path.GetFileName(path)));reader.HydrateEncryptedFileAsync=(path,token)=>{calls++;File.Copy(Path.Combine(held,Path.GetFileName(path)),Path.Combine(root,"source",path),true);return Task.CompletedTask;};reader.SyncAsync().GetAwaiter().GetResult();Assert(calls==0,"Discovery hydrated content.");Assert(reader.Enumerate("").Count==2);Assert(reader.ListVersions().Count==3);Assert(calls==0,"History listing hydrated content.");var one=new byte[1];Assert(reader.ReadRange("a",0,one)==1);Assert(calls==1,"A selected chunk read must hydrate one chunk.");reader.HydrateEncryptedFileAsync=(path,token)=>Task.CompletedTask;Throws<IOException>(()=>reader.ReadRange("b",0,one));}finally{Directory.Delete(root,true);}
}
