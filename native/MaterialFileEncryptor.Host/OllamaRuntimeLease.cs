using System.Reflection;
using System.Text.Json;

namespace MaterialFileEncryptor.Host;

// File sharing protects admitted members and ancestor identities. It does not
// establish exclusion against all same-user directory insertion or mapped writes.
internal sealed class OllamaRuntimeLease
{
    private readonly ServerFileLease files;
    private readonly ServerFileLease directories;
    internal bool Released { get; private set; }
    internal string Root { get; }
    internal string Executable => Path.Combine(Root, "ollama.exe");
    internal const string VersionDirectory = "v0.40.3-x64-e5ecff02dfc7cae8";
    private OllamaRuntimeLease(string root, ServerFileLease files,ServerFileLease directories) { Root=root;this.files=files;this.directories=directories; }

    internal static OllamaRuntimeLease Acquire(string dataRoot)
    {
        if (!OperatingSystem.IsWindows() || System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture != System.Runtime.InteropServices.Architecture.X64)
            throw new PlatformNotSupportedException("The reviewed runtime requires Windows x64.");
        string root=Path.Combine(Path.GetFullPath(dataRoot),"local-models","managed-runtime",VersionDirectory);
        using Stream stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("MaterialFileEncryptor.OllamaRuntimeFiles") ?? throw new InvalidOperationException("Reviewed runtime inventory is unavailable.");
        using var manifest=JsonDocument.Parse(stream);
        JsonElement archive=manifest.RootElement.GetProperty("archives").EnumerateArray().Single(value=>value.GetProperty("architecture").GetString()=="x64");
        if (archive.GetProperty("version").GetString()!="v0.40.3" || archive.GetProperty("archiveSha256").GetString()!="e5ecff02dfc7cae8ddf6d6b7a7ac5f727ffeedf4491f44ae75ff5b0820dbbbd5")
            throw new InvalidDataException("Reviewed runtime inventory differs.");
        var members=archive.GetProperty("files").EnumerateArray().ToDictionary(value=>value.GetProperty("path").GetString()!.Replace('/',Path.DirectorySeparatorChar),value=>value.GetProperty("sha256").GetString()!,StringComparer.OrdinalIgnoreCase);
        var directoryScope=ServerFileLease.AcquireDirectoryScope(root);
        ServerFileLease? retained=null;
        try
        {
            ValidateInventory(root,members.Keys,directoryScope,true);
            retained=ServerFileLease.AcquireRuntimeInventory(root,members);
            ValidateInventory(root,members.Keys,directoryScope,true);
            foreach(var value in archive.GetProperty("files").EnumerateArray())
                if(new FileInfo(Path.Combine(root,value.GetProperty("path").GetString()!)).Length!=value.GetProperty("bytes").GetInt64()) throw new InvalidDataException("Runtime member length differs.");
            return new OllamaRuntimeLease(root,retained,directoryScope);
        }
        catch { retained?.Release();directoryScope.Release();throw; }
    }
    private static void ValidateInventory(string root,IEnumerable<string> inventory,ServerFileLease scope,bool allowReceipt)
    {
        var expectedFiles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var expectedDirectories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach(string member in inventory)
        {
            if(member.Length==0||member.Length>2048||Path.IsPathRooted(member))throw new InvalidDataException("Runtime member path is invalid.");
            string[] segments=member.Split(Path.DirectorySeparatorChar);
            if(segments.Length>16||segments.Any(value=>value.Length==0||value.Length>255||value is "." or ".."||value.Any(character=>Char.IsControl(character)||character is ':' or '/' or '\\')))throw new InvalidDataException("Runtime member path is invalid.");
            if(!expectedFiles.Add(member)||expectedFiles.Count>4096)throw new InvalidDataException("Runtime inventory exceeds its bound or repeats members.");
            string? parent=Path.GetDirectoryName(member);
            while(!String.IsNullOrEmpty(parent)){expectedDirectories.Add(parent);parent=Path.GetDirectoryName(parent);}
        }
        var actualFiles=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var actualDirectories=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var queue=new Queue<string>();queue.Enqueue(root);int entries=0;
        while(queue.Count!=0)
        {
            string directory=queue.Dequeue();
            // Validate and retain this exact directory before enumerating its
            // children. Never recursively walk an unvalidated child path.
            scope.HoldDirectory(directory);
            foreach(string child in Directory.EnumerateFileSystemEntries(directory,"*",SearchOption.TopDirectoryOnly))
            {
                if(++entries>expectedFiles.Count+expectedDirectories.Count+(allowReceipt?1:0))throw new InvalidDataException("Runtime tree exceeds its admitted entry bound.");
                string relative=Path.GetRelativePath(root,child),name=Path.GetFileName(child);
                if(relative.Length>2048||name.Length==0||name.Length>255||name.Any(character=>Char.IsControl(character)||character is ':' or '/' or '\\'))throw new InvalidDataException("Runtime entry name is invalid.");
                FileAttributes attributes=File.GetAttributes(child);
                if((attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Runtime reparse entries are not admitted.");
                if((attributes&FileAttributes.Directory)!=0)
                {
                    if(!expectedDirectories.Contains(relative)||!actualDirectories.Add(relative))throw new InvalidDataException("Runtime directory inventory differs.");
                    scope.HoldDirectory(child);queue.Enqueue(child);
                }
                else
                {
                    if(allowReceipt&&String.Equals(relative,"managed-runtime.json",StringComparison.OrdinalIgnoreCase))
                    { if(new FileInfo(child).Length>2*1024*1024)throw new InvalidDataException("Runtime receipt exceeds its bound.");continue; }
                    if(!expectedFiles.Contains(relative)||!actualFiles.Add(relative))throw new InvalidDataException("Runtime file inventory differs.");
                }
            }
        }
        if(!actualFiles.SetEquals(expectedFiles)||!actualDirectories.SetEquals(expectedDirectories))throw new InvalidDataException("Runtime tree is incomplete.");
    }
#if OLLAMA_LIFETIME_VERIFIER
    internal static OllamaRuntimeLease AcquireSynthetic(string root,IReadOnlyDictionary<string,string> members)
    {
        var directories=ServerFileLease.AcquireDirectoryScope(root);ServerFileLease? files=null;
        try { ValidateInventory(root,members.Keys,directories,false);files=ServerFileLease.AcquireRuntimeInventory(root,members);ValidateInventory(root,members.Keys,directories,false);return new(root,files,directories); }
        catch { files?.Release();directories.Release();throw; }
    }
#endif
    internal void AssertHeld() { if(Released)throw new InvalidOperationException("Runtime lease is released.");directories.AssertHeld();files.AssertHeld(); }
    internal void Release() { if(Released)return;files.Release();directories.Release();Released=true; }
}
