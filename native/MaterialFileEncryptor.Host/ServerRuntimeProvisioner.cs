#nullable enable
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MaterialFileEncryptor.Host;
internal sealed class ServerRuntimeProvisioner
{
    internal sealed record Member(string Path, long Bytes, string Sha256);
    internal sealed record Inventory(string Root, string Executable, string JavaHash, int Major, string ManifestHash);
    internal sealed record RetainedInventory(Inventory Inventory,ServerFileLease Lease);
    private readonly JsonDocument manifest;
    private readonly string manifestHash;
    private readonly Dictionary<string, Member> files;
    private readonly HashSet<string> directories;
    public ServerRuntimeProvisioner()
    {
        using var stream = typeof(ServerRuntimeProvisioner).Assembly.GetManifestResourceStream("MaterialFileEncryptor.ServerRuntimeManifest") ?? throw new InvalidOperationException("Pinned Java runtime inventory is unavailable.");
        using var memory = new MemoryStream(); stream.CopyTo(memory); byte[] bytes = memory.ToArray();
        manifestHash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant(); manifest = JsonDocument.Parse(bytes);
        files = manifest.RootElement.GetProperty("files").EnumerateArray().ToDictionary(value => value.GetProperty("path").GetString()!, value => new Member(value.GetProperty("path").GetString()!, value.GetProperty("bytes").GetInt64(), value.GetProperty("sha256").GetString()!), StringComparer.Ordinal);
        directories = manifest.RootElement.GetProperty("directories").EnumerateArray().Select(value => value.GetString()!).ToHashSet(StringComparer.Ordinal);
        if (files.Count > 10000 || files.Keys.Concat(directories).Distinct(StringComparer.OrdinalIgnoreCase).Count() != files.Count + directories.Count) throw new InvalidDataException("Invalid pinned runtime inventory.");
    }
    private static void DirectoryProof(string directory)
    {
        for (string? current = Path.GetFullPath(directory); current is not null; current = Path.GetDirectoryName(current))
        { var attributes = File.GetAttributes(current); if ((attributes & FileAttributes.Directory) == 0 || (attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("An unlinked runtime directory is required."); }
    }
    private static string Digest(string file, long expected)
    {
        var attributes = File.GetAttributes(file); if ((attributes & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0 || new FileInfo(file).Length != expected) throw new InvalidDataException("Runtime member identity differs.");
        using var stream = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read);return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }
    public bool Supports(int major) => major == 21 && System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture == System.Runtime.InteropServices.Architecture.X64;
    public async Task<Inventory> Prepare(string baseRoot, string operationId, int major, CancellationToken cancellation)
    {
        if (!Supports(major) || !Regex.IsMatch(operationId,"^[a-f0-9-]{36}$")) throw new InvalidOperationException("No reviewed runtime matches the exact major and architecture.");
        string operation = Path.Combine(baseRoot, "runtime-" + operationId), archive = Path.Combine(operation, "archive.zip"), staging = Path.Combine(operation, "extracting"), target = Path.Combine(operation, "runtime");DirectoryProof(operation);
        if (Digest(archive, manifest.RootElement.GetProperty("archiveBytes").GetInt64()) != manifest.RootElement.GetProperty("archiveSha256").GetString()) throw new InvalidDataException("Pinned runtime archive differs.");
        var directoryLease=ServerFileLease.AcquireDirectoryScope(operation);
        try
        {
        if (Directory.Exists(staging) || Directory.Exists(target)) throw new InvalidOperationException("Retained runtime requires explicit recovery.");
        Directory.CreateDirectory(staging);DirectoryProof(staging);
        directoryLease.HoldDirectory(staging);
        // Keep the verified archive read-only and deny write/delete sharing through extraction.
        using var archiveStream = new FileStream(archive, FileMode.Open, FileAccess.Read, FileShare.Read);
        if (Convert.ToHexString(SHA256.HashData(archiveStream)).ToLowerInvariant() != manifest.RootElement.GetProperty("archiveSha256").GetString()) throw new InvalidDataException();archiveStream.Position = 0;
        using var zip = new ZipArchive(archiveStream, ZipArchiveMode.Read);string prefix=manifest.RootElement.GetProperty("archiveRoot").GetString()+"/";
        if (zip.Entries.Count != files.Count + directories.Count + 1) throw new InvalidDataException("Runtime archive count differs.");
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
        foreach (var entry in zip.Entries)
        {
            cancellation.ThrowIfCancellationRequested();string name=entry.FullName;
            if (!name.StartsWith(prefix,StringComparison.Ordinal) || !seen.Add(name) || name.Contains('\\') || name.Contains(':') || name.Any(char.IsControl) || name.Split('/').Any(part=>part is "." or "..") || ((entry.ExternalAttributes>>16)&0xF000)==0xA000 || (entry.ExternalAttributes&0x400)!=0) throw new InvalidDataException("Unsafe runtime archive member.");
            string relative=name.Substring(prefix.Length);
            if (relative.Length==0) { if(entry.Length!=0)throw new InvalidDataException();continue; }
            if (relative.EndsWith('/')) { if(!directories.Contains(relative.TrimEnd('/'))||entry.Length!=0)throw new InvalidDataException();continue; }
            if (!files.TryGetValue(relative,out var member)||entry.Length!=member.Bytes||entry.Length>256L*1024*1024)throw new InvalidDataException("Unreviewed runtime archive member.");total+=entry.Length;
        }
        if(total!=manifest.RootElement.GetProperty("expandedBytes").GetInt64()||total>512L*1024*1024)throw new InvalidDataException("Runtime expansion bound differs.");
        foreach(string directory in directories.OrderBy(value=>value.Length)){cancellation.ThrowIfCancellationRequested();Directory.CreateDirectory(Path.Combine(staging,directory));DirectoryProof(Path.Combine(staging,directory));directoryLease.HoldDirectory(Path.Combine(staging,directory));}
        foreach(var entry in zip.Entries.Where(value=>!value.FullName.EndsWith('/')))
        {
            cancellation.ThrowIfCancellationRequested();string relative=entry.FullName.Substring(prefix.Length);var member=files[relative];string destination=Path.Combine(staging,relative);DirectoryProof(Path.GetDirectoryName(destination)!);
            using var input=entry.Open();using var output=new FileStream(destination,FileMode.CreateNew,FileAccess.Write,FileShare.None);byte[] buffer=new byte[65536];long written=0;int read;
            while((read=await input.ReadAsync(buffer,cancellation))!=0){written+=read;if(written>member.Bytes)throw new InvalidDataException("Runtime member expansion exceeded its exact bound.");await output.WriteAsync(buffer.AsMemory(0,read),cancellation);}await output.FlushAsync(cancellation);if(written!=member.Bytes)throw new InvalidDataException();
        }
        Verify(staging,major);cancellation.ThrowIfCancellationRequested();DirectoryProof(operation);
        // Release only this attempt's directory handles for its atomic owned rename.
        directoryLease.Release();DirectoryProof(staging);Directory.Move(staging,target);return Verify(target,major);
        }
        finally { directoryLease.Release(); }
    }
    public Inventory Verify(string root,int major)
    {
        var retained=VerifyAndRetain(root,major);try{return retained.Inventory;}finally{retained.Lease.Release();}
    }
    internal RetainedInventory VerifyAndRetain(string root,int major)
    {
        if(!Supports(major))throw new InvalidOperationException("Unsupported runtime major or architecture.");DirectoryProof(root);
        var lease=ServerFileLease.AcquireRuntimeInventory(root,files.ToDictionary(value=>value.Key,value=>value.Value.Sha256,StringComparer.Ordinal));
        try
        {
        foreach(string directory in directories)lease.HoldDirectory(Path.Combine(root,directory));
        var actualFiles=new HashSet<string>(StringComparer.Ordinal);var actualDirs=new HashSet<string>(StringComparer.Ordinal);var pending=new Stack<string>();pending.Push(root);
        while(pending.Count!=0){string directory=pending.Pop();DirectoryProof(directory);foreach(string item in Directory.EnumerateFileSystemEntries(directory)){var attributes=File.GetAttributes(item);if((attributes&FileAttributes.ReparsePoint)!=0)throw new InvalidDataException("Linked runtime content is forbidden.");string relative=Path.GetRelativePath(root,item).Replace('\\','/');if((attributes&FileAttributes.Directory)!=0){if(!directories.Contains(relative)||!actualDirs.Add(relative))throw new InvalidDataException();pending.Push(item);}else{if(!files.TryGetValue(relative,out var member)||!actualFiles.Add(relative)||Digest(item,member.Bytes)!=member.Sha256)throw new InvalidDataException("Runtime tree differs from pinned inventory.");}}}
        if(actualFiles.Count!=files.Count||actualDirs.Count!=directories.Count)throw new InvalidDataException("Runtime tree is incomplete.");
        string release=File.ReadAllText(Path.Combine(root,"release"));if(!Regex.IsMatch(release,"(?m)^JAVA_VERSION=\"21[.\"+_-]"))throw new InvalidDataException("Java major differs.");
        return new RetainedInventory(new Inventory(root,Path.Combine(root,"bin","java.exe"),files["bin/java.exe"].Sha256,major,manifestHash),lease);
        }
        catch { lease.Release();throw; }
    }
}
