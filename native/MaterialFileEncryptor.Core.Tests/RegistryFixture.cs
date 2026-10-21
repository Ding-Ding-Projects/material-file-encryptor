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
        if(action is not ("init" or "edit" or "sync" or "snapshot" or "inspect"))throw new ArgumentException("Unknown fixture action.");
        if(device is not ("deviceA" or "deviceB"))throw new ArgumentException("Unknown fixture device.");
        if(scenario is not ("concurrent-edit" or "delete-vs-edit"))throw new ArgumentException("Unknown fixture case.");
        string root=ValidateRoot(args[1],action=="init");
        using var credential=Credential();
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
        Console.WriteLine(JsonSerializer.Serialize(new {device,vaultId=engine.VaultId,entries}));return 0;
    }
}
