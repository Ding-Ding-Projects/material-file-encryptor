using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using MaterialFileEncryptor.Core;

// Synthetic composition fixture only. Never points at a user's vault or mount.
internal static class RegistryFixture
{
    private const string Marker = "MaterialFileEncryptor synthetic registry fixture v1\n";
    private const string Sentinel = ".registry-fixture-owner";
    private static readonly Regex RootName = new(@"\Amfe-registry-fixture-[A-Za-z0-9_-]{1,80}\z", RegexOptions.CultureInvariant);
    private static readonly Regex EncryptedPath = new(@"\A(?:vault\.json|(?:commits|parts|activity)/[a-fA-F0-9]{32,64}\.mfe)\z", RegexOptions.CultureInvariant);
    // Public deterministic fixture input, never a credential from outside this test.
    private static VaultCredentials Credential() => VaultCredentials.KeyFile(Enumerable.Range(0,32).Select(i=>(byte)i).ToArray());
    private static VaultOptions Options(string root,string device) => new()
    {
        StorageRoot=Path.Combine(root,device=="deviceA"?"A":"B","source"),CacheRoot=Path.Combine(root,device=="deviceA"?"A":"B","cache"),
        DeviceId="registry-fixture-"+device,PartSizeBytes=1024*1024
    };
    private static string ValidateRoot(string value,bool initializing)
    {
        if(!Path.IsPathFullyQualified(value))throw new ArgumentException("Fixture root must be absolute.");
        string root=Path.TrimEndingDirectorySeparator(Path.GetFullPath(value));
        string temporary=Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        var comparison=OperatingSystem.IsWindows()?StringComparison.OrdinalIgnoreCase:StringComparison.Ordinal;
        if(!root.StartsWith(temporary+Path.DirectorySeparatorChar,comparison)||!RootName.IsMatch(Path.GetFileName(root)))
            throw new ArgumentException("Fixture root must have the reserved test prefix beneath the temporary directory.");
        CheckPhysical(root);
        if(initializing)
        {
            if(File.Exists(root)||Directory.Exists(root))throw new IOException("Fixture initialization requires a nonexistent root.");
        }
        else
        {
            string sentinel=Path.Combine(root,Sentinel);CheckPhysical(sentinel);
            if(!File.Exists(sentinel)||File.ReadAllText(sentinel)!=Marker+root+"\n")throw new InvalidDataException("Fixture ownership sentinel does not match.");
        }
        return root;
    }
    private static void CheckPhysical(string path)
    {
        for(string? current=Path.GetFullPath(path);current is not null;current=Path.GetDirectoryName(current))
        {
            try { if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("Fixture paths cannot use symbolic links or junctions."); }
            catch(FileNotFoundException) { }
            catch(DirectoryNotFoundException) { }
        }
    }
    private static void CopyEncrypted(string source,string destination)
    {
        CheckPhysical(source);CheckPhysical(destination);
        if(Directory.Exists(destination)||File.Exists(destination))throw new IOException("Snapshot destination already exists.");
        var files=Directory.GetFiles(source).ToList();
        foreach(string directory in Directory.GetDirectories(source))
        {
            CheckPhysical(directory);
            if(Path.GetFileName(directory) is not ("commits" or "parts" or "activity") || Directory.GetDirectories(directory).Length!=0)
                throw new InvalidDataException("Snapshot contains a directory outside the encrypted allowlist.");
            files.AddRange(Directory.GetFiles(directory));
        }
        var selected=new List<(string Source,string Relative)>();
        foreach(string file in files)
        {
            CheckPhysical(file);
            string relative=Path.GetRelativePath(source,file).Replace('\\','/');
            if(!EncryptedPath.IsMatch(relative))throw new InvalidDataException("Snapshot contains a file outside the encrypted allowlist.");
            selected.Add((file,relative));
        }
        if(!selected.Any(item=>item.Relative=="vault.json"))throw new InvalidDataException("Snapshot configuration is missing.");
        Directory.CreateDirectory(destination);
        foreach(var file in selected)
        {
            string target=Path.Combine(destination,file.Relative);Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file.Source,target,false);
        }
    }
    private static void ExchangeEncrypted(string source,string destination)
    {
        CheckPhysical(source);CheckPhysical(destination);
        foreach(string directory in Directory.GetDirectories(source))
        {
            CheckPhysical(directory);
            if(Path.GetFileName(directory) is not ("commits" or "parts" or "activity")||Directory.GetDirectories(directory).Length!=0)
                throw new InvalidDataException("Fixture exchange contains an unexpected directory.");
        }
        foreach(string file in Directory.GetFiles(source,"*",SearchOption.AllDirectories))
        {
            CheckPhysical(file);string relative=Path.GetRelativePath(source,file).Replace('\\','/');
            if(!EncryptedPath.IsMatch(relative))throw new InvalidDataException("Fixture exchange contains an unexpected file.");
            string target=Path.Combine(destination,relative);CheckPhysical(target);Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            if(File.Exists(target))
            {
                using var existing=File.OpenRead(target);using var incoming=File.OpenRead(file);
                if(!SHA256.HashData(existing).SequenceEqual(SHA256.HashData(incoming)))throw new InvalidDataException("Immutable fixture objects disagree.");
            }
            else File.Copy(file,target,false);
        }
    }
    private static async Task PrepareReview(string root,string device,string scenario,VaultCredentials credential)
    {
        Directory.CreateDirectory(root);File.WriteAllText(Path.Combine(root,Sentinel),Marker+root+"\n");
        string keyFilePath=Path.Combine(root,"synthetic-fixture-key.bin");CheckPhysical(keyFilePath);
        using(var output=new FileStream(keyFilePath,FileMode.CreateNew,FileAccess.Write,FileShare.None))
        {output.Write(Enumerable.Range(0,32).Select(index=>(byte)index).ToArray());output.Flush(true);}
        var aOptions=Options(root,"deviceA");var bOptions=Options(root,"deviceB");
        using(var seed=VaultEngine.Create(aOptions,credential))
        {
            if(scenario=="directory-rename") {seed.CreateDirectory("shared");seed.CreateFile("shared/child.txt");seed.WriteRange("shared/child.txt",0,"BASE"u8);}
            else {seed.CreateFile("shared.txt");seed.WriteRange("shared.txt",0,"BASE"u8);}
            await seed.FlushAsync();
        }
        CopyEncrypted(aOptions.StorageRoot,bOptions.StorageRoot);
        using(var a=VaultEngine.Open(aOptions,credential))
        using(var b=VaultEngine.Open(bOptions,credential))
        {
            if(scenario=="directory-rename") {a.Rename("shared","directory-from-device-a");b.Rename("shared","directory-from-device-b");}
            else if(scenario=="file-rename") {a.Rename("shared.txt","name-from-device-a.txt");b.Rename("shared.txt","name-from-device-b.txt");}
            else if(scenario!="empty")
            {
                if(scenario=="delete-edit")a.Delete("shared.txt");else a.WriteRange("shared.txt",0,"AAAA"u8);
                b.WriteRange("shared.txt",0,"BBBB"u8);
            }
            await a.FlushAsync();await b.FlushAsync();
            ExchangeEncrypted(aOptions.StorageRoot,bOptions.StorageRoot);ExchangeEncrypted(bOptions.StorageRoot,aOptions.StorageRoot);
            await a.SyncAsync();await b.SyncAsync();
            if(scenario=="resolution-divergence")
            {
                var first=a.ListConflicts().Items.Single(item=>item.Kind=="file-edit");var second=b.ListConflicts().Items.Single(item=>item.Kind=="file-edit");
                a.ResolveConflict(first.ConflictId,"keep-current",first.Current!.VersionId,first.Preserved!.VersionId);
                b.ResolveConflict(second.ConflictId,"use-preserved",second.Current!.VersionId,second.Preserved!.VersionId);
                await a.FlushAsync();await b.FlushAsync();
                ExchangeEncrypted(aOptions.StorageRoot,bOptions.StorageRoot);ExchangeEncrypted(bOptions.StorageRoot,aOptions.StorageRoot);
                await a.SyncAsync();await b.SyncAsync();
            }
        }
        var selected=Options(root,device);
        string cacheDir=Path.Combine(root,"gui-cache-"+device);CheckPhysical(cacheDir);
        using var fileCredential=VaultCredentials.KeyFile(File.ReadAllBytes(keyFilePath));
        using var reopened=VaultEngine.Open(new VaultOptions{StorageRoot=selected.StorageRoot,CacheRoot=cacheDir,PartSizeBytes=1024*1024},fileCredential);
        await reopened.SyncAsync();
        string kind=scenario switch{"file-edit"=>"file-edit","file-rename" or "directory-rename"=>"rename","delete-edit"=>"delete-versus-edit",_=>"resolution-divergence"};
        var conflicts=reopened.ListConflicts(1000).Items;
        bool expected=scenario=="empty"?conflicts.Count==0:
            scenario=="directory-rename"?conflicts.Count>0&&conflicts.Any(item=>item.UnsupportedReason is not null&&(item.Current?.IsDirectory==true||item.Preserved?.IsDirectory==true)):
            conflicts.Count==1&&conflicts[0].Kind==kind&&conflicts[0].SupportedChoices.Count>0;
        if(!expected)throw new InvalidDataException("Prepared review did not match its requested scenario.");
        Console.WriteLine(JsonSerializer.Serialize(new{prepared=true,fixtureRoot=root,scenario,device,storageDir=selected.StorageRoot,cacheDir,keyFilePath,vaultId=reopened.VaultId,expectedConflicts=conflicts}));
    }
    private static async Task ReviewOperation(string root,string device,bool advance,VaultCredentials credential)
    {
        var selected=Options(root,device);
        string cacheDir=Path.Combine(root,"observer-"+Guid.NewGuid().ToString("N"));CheckPhysical(selected.StorageRoot);CheckPhysical(cacheDir);
        using var engine=VaultEngine.Open(new VaultOptions{StorageRoot=selected.StorageRoot,CacheRoot=cacheDir,DeviceId="registry-review-observer",PartSizeBytes=1024*1024},credential);
        await engine.SyncAsync();
        if(advance)
        {
            var current=engine.ListConflicts(1000).Items.FirstOrDefault(item=>item.Kind=="file-edit"&&item.Current is {IsDirectory:false,IsLive:true})?.Current
                ??throw new InvalidOperationException("A live ordinary-file conflict is required.");
            engine.SetLength(current.Path,0);engine.WriteRange(current.Path,0,"CHANGED-AFTER-REVIEW"u8);await engine.FlushAsync();
        }
        var entries=new List<object>();
        foreach(var entry in engine.Enumerate("").OrderBy(item=>item.Path,StringComparer.Ordinal))
        {
            if(entry.Length>4096)throw new InvalidDataException("Review observation accepts only bounded synthetic entries.");
            byte[] bytes=entry.IsDirectory?[]:new byte[checked((int)entry.Length)];
            if(!entry.IsDirectory&&engine.ReadRange(entry.Path,0,bytes)!=bytes.Length)throw new IOException("Review read was incomplete.");
            entries.Add(new{path=entry.Path,entryId=entry.EntryId,versionId=entry.VersionId,isDirectory=entry.IsDirectory,length=entry.Length,content=entry.IsDirectory?null:Encoding.UTF8.GetString(bytes),sha256=Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()});
        }
        var histories=engine.ListVersions().Where(item=>!item.IsDirectory&&item.IsAvailable).Select(item=>new{id=item.Id,text=engine.PreviewVersion(item.Id).Text}).ToArray();
        Console.WriteLine(JsonSerializer.Serialize(new{verified=true,advanced=advance,fixtureRoot=root,storageDir=selected.StorageRoot,device,vaultId=engine.VaultId,entries,histories,conflicts=engine.ListConflicts(1000).Items}));
    }
    internal static async Task<int> RunAsync(string[] args)
    {
        try { return await ExecuteAsync(args); }
        catch(Exception error)
        {
            Console.Error.WriteLine(JsonSerializer.Serialize(new {error="registry-fixture-rejected",kind=error.GetType().Name}));
            return 2;
        }
    }
    private static async Task<int> ExecuteAsync(string[] args)
    {
        if(args.Length is <3 or >4)throw new ArgumentException("Use action, absolute fixture root, deviceA or deviceB, and optional case.");
        string action=args[0],device=args[2],scenario=args.Length==4?args[3]:"concurrent-edit";
        if(action is not ("init" or "edit" or "sync" or "snapshot" or "inspect" or "prepare-review" or "inspect-review" or "advance-review"))throw new ArgumentException("Unknown fixture action.");
        if(device is not ("deviceA" or "deviceB"))throw new ArgumentException("Unknown fixture device.");
        if(action is "prepare-review" or "inspect-review" or "advance-review")
        {if(scenario is not ("file-edit" or "file-rename" or "delete-edit" or "resolution-divergence" or "empty" or "directory-rename"))throw new ArgumentException("Unknown review fixture case.");}
        else if(scenario is not ("concurrent-edit" or "delete-vs-edit"))throw new ArgumentException("Unknown fixture case.");
        string root=ValidateRoot(args[1],action is "init" or "prepare-review");
        using var credential=Credential();
        if(action=="prepare-review"){await PrepareReview(root,device,scenario,credential);return 0;}
        if(action is "inspect-review" or "advance-review"){await ReviewOperation(root,device,action=="advance-review",credential);return 0;}
        if(action=="init")
        {
            Directory.CreateDirectory(root);File.WriteAllText(Path.Combine(root,Sentinel),Marker+root+"\n");
            using(var first=VaultEngine.Create(Options(root,"deviceA"),credential))
            {
                first.CreateFile("shared.txt");first.WriteRange("shared.txt",0,Encoding.UTF8.GetBytes("BASE"));
                await first.FlushAsync();
            }
            CopyEncrypted(Options(root,"deviceA").StorageRoot,Options(root,"deviceB").StorageRoot);
            using var second=VaultEngine.Open(Options(root,"deviceB"),credential);await second.SyncAsync();
            Console.WriteLine(JsonSerializer.Serialize(new {initialized=true,vaultId=second.VaultId,deviceA=Options(root,"deviceA").StorageRoot,deviceB=Options(root,"deviceB").StorageRoot}));
            return 0;
        }
        var options=Options(root,device);CheckPhysical(options.StorageRoot);CheckPhysical(options.CacheRoot);
        using var engine=VaultEngine.Open(options,credential);
        if(action=="edit")
        {
            string value=device=="deviceA"?"AAAA":"BBBB";
            if(scenario=="delete-vs-edit"&&device=="deviceA")engine.Delete("shared.txt");
            else {engine.SetLength("shared.txt",0);engine.WriteRange("shared.txt",0,Encoding.UTF8.GetBytes(value));}
            string own=device+"-only.txt";engine.CreateFile(own);engine.WriteRange(own,0,Encoding.UTF8.GetBytes(value+"-only"));
            await engine.FlushAsync();
            Console.WriteLine(JsonSerializer.Serialize(new {edited=true,device,scenario}));return 0;
        }
        await engine.SyncAsync();
        if(action=="sync") {Console.WriteLine(JsonSerializer.Serialize(new {synchronized=true,device,vaultId=engine.VaultId}));return 0;}
        if(action=="snapshot")
        {
            using var staged=await engine.StageEncryptedSnapshotAsync();
            string leaseId=Guid.NewGuid().ToString("N");string storageDir=Path.Combine(root,"snapshots",device+"-"+leaseId);
            CopyEncrypted(staged.StorageRoot,storageDir);
            Console.WriteLine(JsonSerializer.Serialize(new {storageDir,leaseId,storageOnly=false,sourceMode="synthetic-core-staged",vaultId=engine.VaultId}));return 0;
        }
        var entries=new List<object>();
        foreach(var entry in engine.Enumerate("").OrderBy(item=>item.Path,StringComparer.Ordinal))
        {
            if(entry.IsDirectory||entry.Length>4096)throw new InvalidDataException("Fixture inspection accepts only bounded synthetic files.");
            byte[] bytes=new byte[checked((int)entry.Length)];int read=engine.ReadRange(entry.Path,0,bytes);
            if(read!=bytes.Length)throw new IOException("Fixture inspection read was incomplete.");
            entries.Add(new {path=entry.Path,entryId=entry.EntryId,length=entry.Length,content=Encoding.UTF8.GetString(bytes),sha256=Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant()});
        }
        Console.WriteLine(JsonSerializer.Serialize(new {device,vaultId=engine.VaultId,entries,conflicts=engine.ListConflicts(1000).Items}));return 0;
    }
}
