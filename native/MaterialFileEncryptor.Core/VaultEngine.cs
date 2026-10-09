using System.Security.Cryptography;
namespace MaterialFileEncryptor.Core;

/// <summary>A ciphertext-only local cache and immutable, multi-writer folder-backed vault.</summary>
public sealed partial class VaultEngine : IDisposable
{
    private readonly object gate = new();
    private readonly string source, cache, device;
    private readonly Config config;
    private readonly byte[] key;
    private Dictionary<string, Entry> entries = new(StringComparer.OrdinalIgnoreCase);
    private Dictionary<string, Entry> baseline = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, Entry> orphans = [];
    private readonly Dictionary<string, int> open = [];
    private HashSet<string> pending = [], known = [], heads = [], pinned = [];
    private long partSize;
    private bool disposed, sourceAvailable;
    private string? lastError;
    private int incoming;
    public VaultSyncStatus Status { get { lock (gate) return new(pending.Count, incoming, sourceAvailable, lastError); } }
    public long PartSizeBytes { get { lock (gate) return partSize; } }
    public string VaultId => config.VaultId;
    public string CacheRoot => cache;
    public string StorageRoot => source;
    private string Domain(string kind, string id = "") => $"mfe-v1/{config.VaultId}/{kind}/{id}";
    private string ObjectPath(string root, string kind, string id) { var path=Path.Combine(root, kind, ValidateId(id) + ".mfe"); VaultCrypto.ValidatePhysicalPath(path); return path; }
    private static string ValidateId(string id) => id.Length is 32 or 64 && id.All(Uri.IsHexDigit) ? id : throw new InvalidDataException("Invalid object identifier.");
    public static void ValidatePartSize(long bytes) { if (bytes < 1024 || bytes > 90000000) throw new ArgumentOutOfRangeException(nameof(bytes), "Part size must be between 1 KiB and 90,000,000 bytes."); }
    private VaultEngine(VaultOptions options, Config config, byte[] key)
    {
        source = Path.GetFullPath(options.StorageRoot); cache = Path.GetFullPath(options.CacheRoot);
        RejectReparseAncestors(source); RejectReparseAncestors(cache);
        if (IsWithin(source, cache) || IsWithin(cache, source)) throw new ArgumentException("Storage and cache roots must be separate, non-overlapping folders.");
        ValidatePartSize(options.PartSizeBytes); partSize = options.PartSizeBytes;
        this.config = config; this.key = key; device = options.DeviceId ?? Guid.NewGuid().ToString("N");
        var check = VaultCrypto.Unseal(config.KeyCheck,key,Domain("key-check"),64);
        try { if(System.Text.Encoding.UTF8.GetString(check)!=config.VaultId)throw new CryptographicException("Invalid master key."); } finally { CryptographicOperations.ZeroMemory(check); }
        Directory.CreateDirectory(cache); Directory.CreateDirectory(Path.Combine(cache, "parts")); Directory.CreateDirectory(Path.Combine(cache, "commits"));
        foreach(var root in new[]{source,cache})foreach(var folder in new[]{"parts","commits"})VaultCrypto.ValidatePhysicalPath(Path.Combine(root,folder));
        var cachedConfig = Path.Combine(cache, "vault.json");
        if (File.Exists(cachedConfig) && VaultCrypto.Deserialize<Config>(VaultCrypto.ReadBounded(cachedConfig,65536)).VaultId != config.VaultId) throw new InvalidDataException("Cache belongs to another vault.");
        VaultCrypto.AtomicWrite(cachedConfig, VaultCrypto.Serialize(config));
        var journalPath = Path.Combine(cache,"journal.mfe");
        if (File.Exists(journalPath))
        {
            var journal = ReadMetadata<Journal>(journalPath, "journal", "");
            ValidateEntries(journal.Entries); ValidateEntries(journal.Baseline); ValidateStoredPartSize(journal.PartSize);
            entries = new(journal.Entries, StringComparer.OrdinalIgnoreCase); baseline = new(journal.Baseline,StringComparer.OrdinalIgnoreCase);
            pending = journal.Pending; known = journal.Known; heads = journal.Heads; pinned = journal.Pinned; partSize = journal.PartSize; versionDue=journal.VersionDue; pendingVersions=journal.PendingVersions; hiddenBin=journal.HiddenBin;
        }
        sourceAvailable = Directory.Exists(source);
    }
    private static bool IsWithin(string child, string parent) => child.Equals(parent,StringComparison.OrdinalIgnoreCase) || child.StartsWith(parent.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);
    private static void RejectReparseAncestors(string path)
    {
        for(var cursor=new DirectoryInfo(path);cursor!=null;cursor=cursor.Parent)
            if(cursor.Exists && (cursor.Attributes&FileAttributes.ReparsePoint)!=0)throw new ArgumentException("Storage and cache roots cannot use symbolic links or junctions.");
    }
    public static VaultEngine Create(VaultOptions options, VaultCredentials credentials)
    {
        var source = Path.GetFullPath(options.StorageRoot);
        if (File.Exists(Path.Combine(source,"vault.json"))) throw new IOException("A vault already exists in this folder.");
        var configuration = new Config { Kind = credentials.Kind, Salt = RandomNumberGenerator.GetBytes(32) };
        var master = RandomNumberGenerator.GetBytes(32); var wrap = VaultCrypto.Derive(credentials,configuration);
        try { configuration.WrappedKey = VaultCrypto.Seal(master,wrap,$"mfe-v1/{configuration.VaultId}/master-wrap/{configuration.Kind}"); }
        finally { CryptographicOperations.ZeroMemory(wrap); }
        configuration.KeyCheck=VaultCrypto.Seal(System.Text.Encoding.UTF8.GetBytes(configuration.VaultId),master,$"mfe-v1/{configuration.VaultId}/key-check/");
        VaultEngine? engine = null;
        try
        {
            engine = new(options,configuration,master);
            Directory.CreateDirectory(source); Directory.CreateDirectory(Path.Combine(source,"parts")); Directory.CreateDirectory(Path.Combine(source,"commits"));
            VaultCrypto.AtomicWrite(Path.Combine(source,"vault.json"),VaultCrypto.Serialize(configuration)); engine.sourceAvailable = true; engine.SaveJournal(); return engine;
        }
        catch { engine?.Dispose(); CryptographicOperations.ZeroMemory(master); throw; }
    }
    private static Config LoadConfig(VaultOptions options)
    {
        var sourceConfig = Path.Combine(options.StorageRoot,"vault.json"); var cacheConfig = Path.Combine(options.CacheRoot,"vault.json");
        var config = VaultCrypto.Deserialize<Config>(VaultCrypto.ReadBounded(File.Exists(sourceConfig) ? sourceConfig : cacheConfig,65536));
        if (config.Format is not (1 or 2) || config.WrappedKey.Length != 68) throw new InvalidDataException("Unsupported vault configuration."); ValidateId(config.VaultId); return config;
    }
    public static VaultEngine Open(VaultOptions options, VaultCredentials credentials)
    {
        var configuration = LoadConfig(options); var wrap = VaultCrypto.Derive(credentials,configuration); byte[] master;
        try { master = VaultCrypto.Unseal(configuration.WrappedKey,wrap,$"mfe-v1/{configuration.VaultId}/master-wrap/{configuration.Kind}",32); }
        finally { CryptographicOperations.ZeroMemory(wrap); }
        try { var engine = new VaultEngine(options,configuration,master); engine.SyncAsync().GetAwaiter().GetResult(); return engine; }
        catch { CryptographicOperations.ZeroMemory(master); throw; }
    }
    public static VaultEngine OpenWithMasterKey(VaultOptions options, ReadOnlySpan<byte> masterKey)
    {
        if (masterKey.Length != 32) throw new ArgumentException("A master key must contain 32 bytes.");
        var engine = new VaultEngine(options,LoadConfig(options),masterKey.ToArray());
        try { engine.SyncAsync().GetAwaiter().GetResult(); return engine; } catch { engine.Dispose(); throw; }
    }
    public byte[] ExportMasterKey() { lock (gate) { Check(); return key.ToArray(); } }
    private void Check() { ObjectDisposedException.ThrowIf(disposed,this); }
    private T ReadMetadata<T>(string path,string kind,string id)
    {
        var plain = VaultCrypto.Unseal(VaultCrypto.ReadBounded(path,VaultCrypto.MaxMetadata + VaultCrypto.Overhead),key,Domain(kind,id),VaultCrypto.MaxMetadata);
        try { return VaultCrypto.Deserialize<T>(plain); } finally { CryptographicOperations.ZeroMemory(plain); }
    }
    private void WriteMetadata<T>(string path,T data,string kind,string id)
    {
        var plain = VaultCrypto.Serialize(data);
        try { if (plain.Length > VaultCrypto.MaxMetadata) throw new IOException("Vault metadata exceeds supported size."); VaultCrypto.AtomicWrite(path,VaultCrypto.Seal(plain,key,Domain(kind,id))); }
        finally { CryptographicOperations.ZeroMemory(plain); }
    }
    private int ChunkBytes(long cap) => (int)(config.Format == 2 ? cap-VaultCrypto.Overhead : Math.Min(65536,cap-VaultCrypto.Overhead));
    private static Entry Clone(Entry entry) => new() { Id=entry.Id,Version=entry.Version,Directory=entry.Directory,Length=entry.Length,ChunkSize=entry.ChunkSize,PartSize=entry.PartSize,Created=entry.Created,Modified=entry.Modified,Attributes=entry.Attributes,Records=new(entry.Records) };
    private static Dictionary<string,Entry> CloneEntries(Dictionary<string,Entry> source) => source.ToDictionary(p=>p.Key,p=>Clone(p.Value),StringComparer.OrdinalIgnoreCase);
    private void SaveJournal() => WriteMetadata(Path.Combine(cache,"journal.mfe"),new Journal { PartSize=partSize,Entries=entries,Baseline=baseline,Pending=pending,Known=known,Heads=heads,Pinned=pinned,VersionDue=versionDue,PendingVersions=pendingVersions,HiddenBin=hiddenBin },"journal","");
    private void ValidateStoredPartSize(long bytes) { if(config.Format==1) { if(bytes<1024||bytes>1073741824)throw new InvalidDataException("Invalid legacy part cap."); } else ValidatePartSize(bytes); }
    private void ValidateEntries(Dictionary<string,Entry> collection)
    {
        if (collection.Count > 1000000) throw new InvalidDataException("Too many entries.");
        var normalized = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in collection)
        {
            if (pair.Key != VaultPath.Normalize(pair.Key) || !normalized.Add(pair.Key)) throw new InvalidDataException("Invalid namespace.");
            var e = pair.Value; ValidateId(e.Id); ValidateId(e.Version);
            if (e.Length < 0 || !e.Directory && e.ChunkSize is < 1 or > 89999964 || e.Directory && (e.Length != 0 || e.Records.Count != 0)) throw new InvalidDataException("Invalid entry.");
            if(!e.Directory) { ValidateStoredPartSize(e.PartSize); if(e.ChunkSize>e.PartSize-VaultCrypto.Overhead)throw new InvalidDataException("Record exceeds part cap."); }
            foreach (var r in e.Records) { ValidateId(r.Value.Part); if (r.Key < 0 || r.Value.Offset < 0 || r.Value.PlainLength < 0 || r.Value.PlainLength > e.ChunkSize || r.Value.RecordLength != r.Value.PlainLength+VaultCrypto.Overhead || r.Key > long.MaxValue / Math.Max(e.ChunkSize,1)) throw new InvalidDataException("Invalid record map."); }
        }
    }
    private Entry Find(string path) => entries.TryGetValue(path,out var entry) ? entry : throw new FileNotFoundException("Vault entry was not found.",path);
    private Entry FindId(string id) => id==config.VaultId ? new Entry { Id=config.VaultId,Version=config.VaultId,Directory=true,Attributes=16,Created=DateTimeOffset.UnixEpoch,Modified=DateTimeOffset.UnixEpoch } : entries.Values.FirstOrDefault(e=>e.Id == id) ?? (orphans.TryGetValue(id,out var entry) ? entry : throw new FileNotFoundException("Vault handle was not found."));
    private static string Name(string path) => path[(path.LastIndexOf('/')+1)..];
    private bool IsPinned(string path,Entry entry)
    {
        if(pinned.Contains(entry.Id) || pinned.Contains(config.VaultId))return true;
        for(var parent=VaultPath.Parent(path);parent!="";parent=VaultPath.Parent(parent))if(entries.TryGetValue(parent,out var directory)&&pinned.Contains(directory.Id))return true;
        return false;
    }
    private VaultEntryInfo Info(string path,Entry entry) => new(path,Name(path),entry.Directory,entry.Length,entry.Created,entry.Modified,IsPinned(path,entry),entry.Version,entry.Id,entry.Attributes,entry.PartSize,entry.Records.Values.Select(r=>r.Part).Distinct().Count());
    public VaultEntryInfo? GetInfo(string path)
    {
        lock(gate) { Check(); path=VaultPath.Normalize(path); if(path=="") return Info("",FindId(config.VaultId)); return entries.TryGetValue(path,out var e)?Info(path,e):null; }
    }
    public VaultEntryInfo GetInfoById(string id) { lock(gate) { Check(); var pair=entries.FirstOrDefault(p=>p.Value.Id==id); return Info(pair.Key ?? "",FindId(id)); } }
    public IReadOnlyList<VaultEntryInfo> Enumerate(string path)
    {
        lock(gate) { Check(); path=VaultPath.Normalize(path); if(path!="" && !Find(path).Directory) throw new IOException("Entry is not a directory."); return entries.Where(p=>VaultPath.Parent(p.Key).Equals(path,StringComparison.OrdinalIgnoreCase)).Select(p=>Info(p.Key,p.Value)).OrderBy(p=>p.Name,StringComparer.OrdinalIgnoreCase).ToArray(); }
    }
    private void EnsureParent(string path) { var parent=VaultPath.Parent(path); if(parent!="" && !Find(parent).Directory) throw new DirectoryNotFoundException("Parent is not a directory."); }
    private void CreateEntry(string path,bool directory)
    {
        lock(gate) { Check(); path=VaultPath.Normalize(path); if(path=="" || entries.ContainsKey(path)) throw new IOException("Entry already exists."); EnsureParent(path); entries.Add(path,new Entry { Directory=directory,ChunkSize=ChunkBytes(partSize),PartSize=partSize,Attributes=directory?16u:32u }); }
    }
    public void CreateFile(string path) => CreateEntry(path,false);
    public void CreateDirectory(string path) => CreateEntry(path,true);
    private byte[] ReadChunk(Entry e,long index)
    {
        var output=new byte[e.ChunkSize]; if(!e.Records.TryGetValue(index,out var record)) return output;
        byte[] plain;
        try { plain=ReadRecord(EnsurePart(record.Part),record,e.ChunkSize); }
        catch(Exception ex) when(ex is IOException or CryptographicException or InvalidDataException)
        {
            var remote=ObjectPath(source,"parts",record.Part); if(!Directory.Exists(source)||!File.Exists(remote))throw;
            // Verify the complete immutable object before replacing an unhealthy local cache copy.
            VerifyPart(remote,record.Part); using(var input=File.OpenRead(remote))CopyAtomic(input,ObjectPath(cache,"parts",record.Part));
            plain=ReadRecord(ObjectPath(cache,"parts",record.Part),record,e.ChunkSize);
        }
        try { if(plain.Length!=record.PlainLength) throw new InvalidDataException("Record length does not match metadata."); plain.CopyTo(output,0); } finally { CryptographicOperations.ZeroMemory(plain); }
        return output;
    }
    private byte[] ReadRecord(string path,RecordRef record,int maximum)
    {
        if(config.Format==2)VerifyPart(path,record.Part);
        var encrypted=new byte[record.RecordLength];
        using(var stream=File.OpenRead(path)) { if(stream.Length>1073741824 || record.Offset>stream.Length-record.RecordLength)throw new InvalidDataException("Incomplete or oversized encrypted part."); stream.Position=record.Offset; stream.ReadExactly(encrypted); }
        return VaultCrypto.Unseal(encrypted,key,config.Format==2?Domain("chunk"):Domain("record",record.Part+":"+record.Offset),maximum);
    }
    private void VerifyPart(string path,string id)
    {
        VaultCrypto.ValidatePhysicalPath(path); using var stream=File.OpenRead(path); if(config.Format==2) { if(stream.Length>90000000 || stream.Length<VaultCrypto.Overhead)throw new InvalidDataException("Invalid chunk size."); if(!Convert.ToHexString(SHA256.HashData(stream)).Equals(id,StringComparison.OrdinalIgnoreCase))throw new CryptographicException("Chunk hash mismatch."); stream.Position=0; var blob=new byte[(int)stream.Length];stream.ReadExactly(blob);var content=VaultCrypto.Unseal(blob,key,Domain("chunk"),89999964);CryptographicOperations.ZeroMemory(content);return; } if(stream.Length<VaultCrypto.Overhead || stream.Length>1073741824)throw new InvalidDataException("Invalid part size.");
        var header=new byte[VaultCrypto.Overhead];
        while(stream.Position<stream.Length)
        {
            var offset=stream.Position; stream.ReadExactly(header); var length=System.Buffers.Binary.BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan(4));
            if(length<0 || length>65536 || length>stream.Length-stream.Position)throw new InvalidDataException("Invalid packed record length.");
            var encrypted=new byte[length+VaultCrypto.Overhead]; header.CopyTo(encrypted,0); stream.ReadExactly(encrypted.AsSpan(VaultCrypto.Overhead)); var plain=VaultCrypto.Unseal(encrypted,key,Domain("record",id+":"+offset),65536); CryptographicOperations.ZeroMemory(plain);
        }
    }
    private string EnsurePart(string id)
    {
        var local=ObjectPath(cache,"parts",id); if(File.Exists(local)) return local;
        var remote=ObjectPath(source,"parts",id); if(!File.Exists(remote)&&HydrateEncryptedFileAsync!=null)throw new VaultHydrationRequiredException(new[]{"parts/"+id+".mfe"}); if(!sourceAvailable || !File.Exists(remote)) throw new IOException("Encrypted content is unavailable offline.");
        using var input=File.OpenRead(remote); if(input.Length>1073741824 || input.Length<VaultCrypto.Overhead) throw new InvalidDataException("Invalid part size.");
        CopyAtomic(input,local); return local;
    }
    private static void CopyAtomic(Stream input,string destination)
    {
        VaultCrypto.ValidatePhysicalPath(destination);
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!); var temp=destination+"."+Guid.NewGuid().ToString("N")+".tmp";
        try { using(var output=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,FileOptions.WriteThrough)) { input.CopyTo(output); output.Flush(true); } File.Move(temp,destination,true); } finally { if(File.Exists(temp)) File.Delete(temp); }
    }
    private int Read(Entry e,long offset,Span<byte> destination)
    {
        if(e.Directory) throw new IOException("Cannot read a directory."); if(offset<0) throw new ArgumentOutOfRangeException(nameof(offset)); if(offset>=e.Length) return 0;
        var count=(int)Math.Min(destination.Length,e.Length-offset); RequireAvailable(RangeRecords(e,offset,count)); var written=0;
        while(written<count) { var index=offset/e.ChunkSize; var within=(int)(offset%e.ChunkSize); var chunk=ReadChunk(e,index); var take=Math.Min(count-written,e.ChunkSize-within); try { chunk.AsSpan(within,take).CopyTo(destination[written..]); } finally { CryptographicOperations.ZeroMemory(chunk); } written+=take; offset+=take; } return written;
    }
    public int ReadRange(string path,long offset,Span<byte> destination) { lock(gate) { Check(); return Read(Find(VaultPath.Normalize(path)),offset,destination); } }
    public int ReadRangeById(string id,long offset,Span<byte> destination) { lock(gate) { Check(); return Read(FindId(id),offset,destination); } }
    private sealed class PartWriter : IDisposable
    {
        private readonly VaultEngine engine; private FileStream? stream; private string id=""; private string? temp, final;
        internal PartWriter(VaultEngine engine) => this.engine=engine;
        internal RecordRef Add(ReadOnlySpan<byte> plain)
        {
            if(engine.config.Format==2) { var blob=VaultCrypto.Seal(plain,engine.key,engine.Domain("chunk")); if(blob.Length>engine.partSize || blob.Length>90000000)throw new IOException("Chunk exceeds physical cap."); var hash=Convert.ToHexString(SHA256.HashData(blob)).ToLowerInvariant(); VaultCrypto.AtomicWrite(engine.ObjectPath(engine.cache,"parts",hash),blob);return new(hash,0,plain.Length,blob.Length); }
            if(stream==null || stream.Position+plain.Length+VaultCrypto.Overhead>engine.partSize) { Finish(); id=Guid.NewGuid().ToString("N"); final=engine.ObjectPath(engine.cache,"parts",id); temp=final+".tmp"; stream=new(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,FileOptions.WriteThrough); }
            var position=stream.Position; var sealedBytes=VaultCrypto.Seal(plain,engine.key,engine.Domain("record",id+":"+position)); stream.Write(sealedBytes); return new(id,position,plain.Length,sealedBytes.Length);
        }
        internal void Finish() { if(stream==null)return; stream.Flush(true); stream.Dispose(); stream=null; File.Move(temp!,final!,false); temp=null; }
        public void Dispose() { stream?.Dispose(); if(temp!=null && File.Exists(temp))File.Delete(temp); }
    }
    private void Write(Entry e,long offset,ReadOnlySpan<byte> data)
    {
        if(e.Directory) throw new IOException("Cannot write a directory."); if(offset<0 || offset>long.MaxValue-data.Length)throw new ArgumentOutOfRangeException(nameof(offset)); if(data.Length==0)return;
        RequireAvailable(e.PartSize!=partSize?e.Records.Values:RangeRecords(e,offset,data.Length));
        if(e.PartSize!=partSize)Repack(e,partSize,CancellationToken.None);
        var replacements=new Dictionary<long,RecordRef>(); using var writer=new PartWriter(this); var consumed=0;
        while(consumed<data.Length) { var index=offset/e.ChunkSize; var within=(int)(offset%e.ChunkSize); var take=Math.Min(data.Length-consumed,e.ChunkSize-within); var chunk=ReadChunk(e,index); try { var incomingBytes=data.Slice(consumed,take); if(!incomingBytes.SequenceEqual(chunk.AsSpan(within,take))) { incomingBytes.CopyTo(chunk.AsSpan(within)); replacements[index]=writer.Add(chunk); } } finally { CryptographicOperations.ZeroMemory(chunk); } offset+=take; consumed+=take; }
        writer.Finish(); foreach(var pair in replacements)e.Records[pair.Key]=pair.Value; e.Length=Math.Max(e.Length,offset); Touch(e); MarkDue(e);
    }
    private static void Touch(Entry e) { e.Version=Guid.NewGuid().ToString("N"); e.Modified=DateTimeOffset.UtcNow; }
    public void WriteRange(string path,long offset,ReadOnlySpan<byte> data) { lock(gate) { Check(); Write(Find(VaultPath.Normalize(path)),offset,data); } }
    public void WriteRangeById(string id,long offset,ReadOnlySpan<byte> data) { lock(gate) { Check(); Write(FindId(id),offset,data); } }
    private void Resize(Entry e,long length)
    {
        if(e.Directory)throw new IOException("Cannot resize a directory."); if(length<0)throw new ArgumentOutOfRangeException(nameof(length)); if(length==e.Length)return;
        RequireAvailable(e.PartSize!=partSize?e.Records.Values:RangeRecords(e,length,length<e.Length&&length%e.ChunkSize!=0?1:0));
        if(e.PartSize!=partSize)Repack(e,partSize,CancellationToken.None);
        if(length<e.Length)
        {
            var records=new Dictionary<long,RecordRef>(e.Records); var last=length/e.ChunkSize; foreach(var index in records.Keys.Where(i=>i>=last+(length%e.ChunkSize==0?0:1)).ToArray())records.Remove(index);
            if(length%e.ChunkSize!=0 && records.ContainsKey(last)) { var chunk=ReadChunk(e,last); try { chunk.AsSpan((int)(length%e.ChunkSize)).Clear(); using var writer=new PartWriter(this); records[last]=writer.Add(chunk); writer.Finish(); } finally { CryptographicOperations.ZeroMemory(chunk); } } e.Records=records;
        }
        e.Length=length; Touch(e); MarkDue(e);
    }
    public void SetLength(string path,long length) { lock(gate) { Check(); Resize(Find(VaultPath.Normalize(path)),length); } }
    public void SetLengthById(string id,long length) { lock(gate) { Check(); Resize(FindId(id),length); } }
    public void SetBasicInfo(string path,uint? attributes=null,DateTimeOffset? createdUtc=null,DateTimeOffset? modifiedUtc=null)
    {
        lock(gate) { Check(); var e=Find(VaultPath.Normalize(path)); if(attributes.HasValue)e.Attributes=attributes.Value; if(createdUtc.HasValue)e.Created=createdUtc.Value; if(modifiedUtc.HasValue)e.Modified=modifiedUtc.Value; e.Version=Guid.NewGuid().ToString("N"); }
    }
    public void SetBasicInfoById(string id,uint? attributes=null,DateTimeOffset? createdUtc=null,DateTimeOffset? modifiedUtc=null)
    {
        lock(gate) { Check(); var e=FindId(id); if(attributes.HasValue)e.Attributes=attributes.Value; if(createdUtc.HasValue)e.Created=createdUtc.Value; if(modifiedUtc.HasValue)e.Modified=modifiedUtc.Value; e.Version=Guid.NewGuid().ToString("N"); }
    }
    public void DeleteById(string id,bool recursive=false)
    {
        lock(gate) { Check(); if(id==config.VaultId)throw new IOException("Cannot delete root."); var path=entries.FirstOrDefault(p=>p.Value.Id==id).Key; if(path!=null)Delete(path,recursive);else FindId(id); }
    }
    private void Remove(string path,string? deletionBatch=null) { var e=Find(path); CaptureVersion(path,e,true,deletionBatch); versionDue.Remove(e.Id); if(open.ContainsKey(e.Id))orphans[e.Id]=e; entries.Remove(path); }
    public void Delete(string path,bool recursive=false)
    {
        lock(gate) { Check(); path=VaultPath.Normalize(path); if(path=="")throw new IOException("Cannot delete root."); var e=Find(path); var children=entries.Keys.Where(p=>p.StartsWith(path+"/",StringComparison.OrdinalIgnoreCase)).ToArray(); if(e.Directory && children.Length>0 && !recursive)throw new IOException("Directory is not empty."); var deletionBatch=Guid.NewGuid().ToString("N"); foreach(var child in children)Remove(child,deletionBatch); Remove(path,deletionBatch); }
    }
    public void Rename(string oldPath,string newPath,bool replace=false)
    {
        lock(gate)
        {
            Check(); oldPath=VaultPath.Normalize(oldPath); newPath=VaultPath.Normalize(newPath); if(oldPath=="" || newPath=="")throw new IOException("Cannot rename root."); var value=Find(oldPath); EnsureParent(newPath);
            if(value.Directory && newPath.StartsWith(oldPath+"/",StringComparison.OrdinalIgnoreCase))throw new IOException("Cannot move a directory into itself.");
            if(oldPath.Equals(newPath,StringComparison.OrdinalIgnoreCase)) { var changes=entries.Where(p=>p.Key.Equals(oldPath,StringComparison.OrdinalIgnoreCase)||p.Key.StartsWith(oldPath+"/",StringComparison.OrdinalIgnoreCase)).ToArray(); foreach(var item in changes)entries.Remove(item.Key); foreach(var item in changes)entries[newPath+item.Key[oldPath.Length..]]=item.Value; return; }
            if(entries.TryGetValue(newPath,out var existing)) { if(!replace || existing.Directory!=value.Directory || existing.Directory && entries.Keys.Any(p=>p.StartsWith(newPath+"/",StringComparison.OrdinalIgnoreCase)))throw new IOException("Destination already exists or cannot be replaced."); Remove(newPath); }
            var moved=entries.Where(p=>p.Key.Equals(oldPath,StringComparison.OrdinalIgnoreCase)||p.Key.StartsWith(oldPath+"/",StringComparison.OrdinalIgnoreCase)).ToArray(); foreach(var item in moved)entries.Remove(item.Key); foreach(var item in moved)entries[newPath+item.Key[oldPath.Length..]]=item.Value;
        }
    }
    private sealed class OpenLease(VaultEngine engine,string id) : IDisposable { private bool closed; public void Dispose() { lock(engine.gate) { if(closed)return; closed=true; if(engine.open.TryGetValue(id,out var count)) { if(count==1) {engine.open.Remove(id);if(engine.orphans.Remove(id))engine.versionDue.Remove(id);}else engine.open[id]=count-1; } } } }
    public IDisposable AcquireOpen(string path) { lock(gate) { Check(); return AcquireOpenById(Find(VaultPath.Normalize(path)).Id); } }
    public IDisposable AcquireOpenById(string id) { lock(gate) { Check(); FindId(id); open[id]=open.GetValueOrDefault(id)+1; return new OpenLease(this,id); } }
    public void SetPartSize(long bytes) { lock(gate) { Check(); ValidatePartSize(bytes); partSize=bytes; SaveJournal(); } }
    private void FlushLocal()
    {
        var changes=new List<Change>();
        foreach(var path in baseline.Keys.Union(entries.Keys,StringComparer.OrdinalIgnoreCase).Order(StringComparer.OrdinalIgnoreCase))
        {
            baseline.TryGetValue(path,out var old); entries.TryGetValue(path,out var current);
            var oldPath=baseline.Keys.FirstOrDefault(p=>p.Equals(path,StringComparison.OrdinalIgnoreCase));
            var newPath=entries.Keys.FirstOrDefault(p=>p.Equals(path,StringComparison.OrdinalIgnoreCase));
            if(old?.Version!=current?.Version || oldPath!=newPath) changes.Add(new Change { Path=newPath??oldPath!,ExpectedVersion=old?.Version,Value=current==null?null:Clone(current) });
        }
        if(changes.Count>0 || pendingVersions.Count>0 || pendingBinHidden.Count>0)
        {
            var commit=new Commit { Versions=[..pendingVersions],BinHiddenIds=[..pendingBinHidden],Device=device,Parents=heads.Order(StringComparer.Ordinal).ToList(),Changes=changes };
            foreach(var change in changes.Where(c=>c.Value!=null))for(var parent=VaultPath.Parent(change.Path);parent!="";parent=VaultPath.Parent(parent))if(entries.TryGetValue(parent,out var directory))commit.Directories[parent]=Clone(directory);
            WriteMetadata(ObjectPath(cache,"commits",commit.Id),commit,"commit",commit.Id);
            pendingVersions.Clear(); pendingBinHidden.Clear(); pending.Add(commit.Id); known.Add(commit.Id); heads=[commit.Id]; baseline=CloneEntries(entries); HistoryChanged?.Invoke();
        }
        SaveJournal();
    }
    public Task FlushAsync(CancellationToken cancellationToken=default)
    {
        lock(gate) { Check(); cancellationToken.ThrowIfCancellationRequested(); FlushLocal(); Publish(cancellationToken); SaveJournal(); return Task.CompletedTask; }
    }
    private IEnumerable<string> Parts(Commit commit) => commit.Changes.Where(c=>c.Value!=null).Select(c=>c.Value!).Concat(commit.Versions.Select(v=>v.Value)).SelectMany(e=>e.Records.Values).Select(r=>r.Part).Distinct(StringComparer.Ordinal);
    private void Publish(CancellationToken token)
    {
        sourceAvailable=Directory.Exists(source); lastError=null; if(!sourceAvailable) { lastError="Storage folder is offline; encrypted changes are queued locally."; return; }
        try
        {
            foreach(var id in pending.ToArray())
            {
                token.ThrowIfCancellationRequested(); var local=ObjectPath(cache,"commits",id); var commit=ReadMetadata<Commit>(local,"commit",id);
                VerifyComplete(commit,false);
                foreach(var part in Parts(commit)) { token.ThrowIfCancellationRequested(); var target=ObjectPath(source,"parts",part); if(!File.Exists(target)&&IsEncryptedFileAvailable?.Invoke("parts/"+part+".mfe")!=true) { var localPart=EnsurePart(part);VerifyPart(localPart,part);using var input=File.OpenRead(localPart); CopyAtomic(input,target); } }
                using(var input=File.OpenRead(local))CopyAtomic(input,ObjectPath(source,"commits",id)); pending.Remove(id);
            }
        }
        catch(Exception ex) when(ex is IOException or UnauthorizedAccessException) { sourceAvailable=Directory.Exists(source); lastError=ex.Message; }
    }
    private bool VerifyComplete(Commit commit,bool authenticateContent=true)
    {
        foreach(var version in commit.Versions){ValidateId(version.Id);if(version.Path!=VaultPath.Normalize(version.Path))throw new InvalidDataException("Invalid version path.");}foreach(var id in commit.BinHiddenIds)ValidateId(id);
        ValidateEntries(commit.Directories);
        if(commit.Directories.Values.Any(e=>!e.Directory))throw new InvalidDataException("Invalid ancestor directory metadata.");
        foreach(var item in commit.Changes.Where(c=>c.Value!=null).Select(c=>(c.Path,Value:c.Value!)).Concat(commit.Versions.Select(v=>(v.Path,v.Value))))
        {
            ValidateEntries(new Dictionary<string,Entry> { [item.Path]=item.Value });
            foreach(var pair in item.Value.Records) { if(authenticateContent){var plain=ReadChunk(item.Value,pair.Key); CryptographicOperations.ZeroMemory(plain);}else if(!PartAvailable(pair.Value.Part))throw new IOException("Referenced encrypted content is unavailable."); }
        }
        return true;
    }
    private static string ConflictPath(string path,string id,Dictionary<string,Entry> current)
    {
        var parent=VaultPath.Parent(path); var name=Name(path); var suffix=" (conflict "+id[..8]+")"; if(name.Length+suffix.Length+12>255)name=name[..(255-suffix.Length-12)]; var candidate=(parent==""?"":parent+"/")+name+suffix; var counter=0; while(current.ContainsKey(candidate))candidate=(parent==""?"":parent+"/")+name+suffix+"-"+(++counter); return candidate;
    }
    private static void Apply(Commit commit,Dictionary<string,Entry> current)
    {
        // Remove destinations before adding moved entries; a namespace commit is one transaction.
        foreach(var change in commit.Changes.OrderBy(c=>c.Value==null?0:1))
        {
            var path=VaultPath.Normalize(change.Path); current.TryGetValue(path,out var existing);
            if(existing?.Version==change.Value?.Version && current.Keys.Contains(path,StringComparer.Ordinal))continue;
            if(existing?.Version==change.ExpectedVersion || existing==null)
            {
                if(change.Value==null)current.Remove(path);else { current.Remove(path); var value=Clone(change.Value); if(current.Values.Any(e=>e.Id==value.Id))value.Id=ConflictId(value.Id,commit.Id,path); current[path]=value; }
            }
            else if(change.Value!=null) { var value=Clone(change.Value); value.Id=ConflictId(value.Id,commit.Id,path); current[ConflictPath(path,commit.Id,current)]=value; }
        }
    }
    private static string ConflictId(string original,string commit,string path) => Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(original+"/"+commit+"/"+path))).ToLowerInvariant()[..32];
    public Task SyncAsync(CancellationToken cancellationToken=default)
    {
        lock(gate)
        {
            Check(); cancellationToken.ThrowIfCancellationRequested(); FlushLocal(); Publish(cancellationToken); incoming=0;
            var commits=new Dictionary<string,Commit>();
            foreach(var id in known) { var path=ObjectPath(cache,"commits",id); if(File.Exists(path))commits[id]=ReadMetadata<Commit>(path,"commit",id); }
            if(sourceAvailable)
            {
                try
                {
                    var folder=Path.Combine(source,"commits"); VaultCrypto.ValidatePhysicalPath(folder); if(Directory.Exists(folder)) foreach(var path in Directory.EnumerateFiles(folder,"*.mfe").Order(StringComparer.Ordinal))
                    {
                        cancellationToken.ThrowIfCancellationRequested(); var id=Path.GetFileNameWithoutExtension(path); ValidateId(id); if(commits.ContainsKey(id))continue;
                        try { var commit=ReadMetadata<Commit>(path,"commit",id); if(commit.Id!=id || commit.Parents.Contains(id))throw new InvalidDataException("Invalid commit identity."); foreach(var parent in commit.Parents)ValidateId(parent); VerifyComplete(commit,false); using(var input=File.OpenRead(path))CopyAtomic(input,ObjectPath(cache,"commits",id)); commits[id]=commit; }
                        catch(Exception ex) when(ex is IOException or CryptographicException or InvalidDataException) { incoming++; lastError="An incoming version is incomplete or failed authentication: "+ex.Message; }
                    }
                }
                catch(Exception ex) when(ex is IOException or UnauthorizedAccessException) { lastError=ex.Message; sourceAvailable=false; }
            }
            var rebuilt=new Dictionary<string,Entry>(StringComparer.OrdinalIgnoreCase); var directories=new Dictionary<string,Entry>(StringComparer.OrdinalIgnoreCase); var applied=new HashSet<string>(); var remaining=new Dictionary<string,Commit>(commits);
            while(remaining.Count>0)
            {
                var ready=remaining.Values.Where(c=>c.Parents.All(applied.Contains)).OrderBy(c=>c.Id,StringComparer.Ordinal).ToArray(); if(ready.Length==0) {incoming+=remaining.Count;break;}
                foreach(var commit in ready) { foreach(var pair in commit.Directories)directories[pair.Key]=Clone(pair.Value); foreach(var change in commit.Changes.Where(c=>c.Value?.Directory==true))directories[change.Path]=Clone(change.Value!); Apply(commit,rebuilt); applied.Add(commit.Id); remaining.Remove(commit.Id); }
            }
            foreach(var path in rebuilt.Keys.ToArray())for(var parent=VaultPath.Parent(path);parent!="";parent=VaultPath.Parent(parent))if(!rebuilt.TryGetValue(parent,out var ancestor)||!ancestor.Directory)
            {
                if(!directories.TryGetValue(parent,out var historical))throw new InvalidDataException("A surviving entry has no ancestor metadata.");
                if(ancestor!=null) { rebuilt.Remove(parent); rebuilt[ConflictPath(parent,ancestor.Version,rebuilt)]=ancestor; }
                var restored=Clone(historical); if(rebuilt.Values.Any(e=>e.Id==restored.Id))restored.Id=ConflictId(restored.Id,"ancestor",parent); rebuilt[parent]=restored;
            }
            // A missing parent must never roll the last usable namespace backwards.
            if(remaining.Count==0 || applied.IsSupersetOf(known)) { foreach(var old in entries.Values)if(open.ContainsKey(old.Id)&&!rebuilt.Values.Any(e=>e.Id==old.Id))orphans[old.Id]=old; entries=rebuilt; baseline=CloneEntries(entries); known=applied; heads=new(applied); foreach(var c in commits.Values.Where(c=>applied.Contains(c.Id)))heads.ExceptWith(c.Parents); }
            SaveJournal(); return Task.CompletedTask;
        }
    }
    public Task SetPinnedAsync(string path,bool keepOffline,CancellationToken cancellationToken=default)
    {
        lock(gate)
        {
            Check(); path=VaultPath.Normalize(path); var selected=path==""?entries.Values.ToArray():new[]{Find(path)}.Concat(entries.Where(p=>p.Key.StartsWith(path+"/",StringComparison.OrdinalIgnoreCase)).Select(p=>p.Value)).ToArray();
            if(keepOffline) { foreach(var e in selected) foreach(var chunk in e.Records.Keys) { cancellationToken.ThrowIfCancellationRequested(); var plain=ReadChunk(e,chunk); CryptographicOperations.ZeroMemory(plain); } foreach(var e in selected)pinned.Add(e.Id); if(path=="")pinned.Add(config.VaultId); }
            else { foreach(var e in selected)pinned.Remove(e.Id); if(path=="")pinned.Remove(config.VaultId); }
            SaveJournal(); return Task.CompletedTask;
        }
    }
    public Task ResplitAsync(string path,long newPartSize,CancellationToken cancellationToken=default)
    {
        lock(gate)
        {
            Check(); ValidatePartSize(newPartSize); path=VaultPath.Normalize(path); var e=Find(path); if(e.Directory)throw new IOException("Resplit requires a file."); RequireAvailable(e.Records.Values); CaptureVersion(path,e,false); var replacement=Clone(e); Repack(replacement,newPartSize,cancellationToken); Touch(replacement); entries[path]=replacement;
            CaptureVersion(path,replacement,false); FlushLocal(); Publish(cancellationToken); SaveJournal(); return Task.CompletedTask;
        }
    }
    private void Repack(Entry e,long newPartSize,CancellationToken token)
    {
        RequireAvailable(e.Records.Values); var chunkSize=ChunkBytes(newPartSize); var targetChunks=new SortedSet<long>();
        foreach(var index in e.Records.Keys)
        {
            var start=checked(index*e.ChunkSize); var end=Math.Min(e.Length,start+e.ChunkSize); if(start>=end)continue;
            for(var target=start/chunkSize;target<=(end-1)/chunkSize;target++)targetChunks.Add(target);
        }
        var records=new Dictionary<long,RecordRef>(); var oldCap=partSize; partSize=newPartSize;
        try { using var writer=new PartWriter(this); foreach(var index in targetChunks) { token.ThrowIfCancellationRequested(); var offset=index*chunkSize; var buffer=new byte[(int)Math.Min(chunkSize,e.Length-offset)]; try { Read(e,offset,buffer); records[index]=writer.Add(buffer); } finally { CryptographicOperations.ZeroMemory(buffer); } } writer.Finish(); }
        finally { partSize=oldCap; }
        e.Records=records; e.ChunkSize=chunkSize; e.PartSize=newPartSize;
    }
    /// <summary>Evicts safe ciphertext referenced by an entry or subtree, preserving unrelated and shared content.</summary>
    public long EvictEntryCache(string path)
    {
        lock(gate)
        {
            Check(); path=VaultPath.Normalize(path); if(path!="")Find(path);
            VaultCrypto.ValidatePhysicalPath(source); VaultCrypto.ValidatePhysicalPath(Path.Combine(cache,"parts"));
            sourceAvailable=Directory.Exists(source); if(!sourceAvailable)return 0;

            var selected=entries.Where(p=>path=="" || p.Key.Equals(path,StringComparison.OrdinalIgnoreCase) || p.Key.StartsWith(path+"/",StringComparison.OrdinalIgnoreCase)).ToArray();
            var selectedPaths=selected.Select(p=>p.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var candidates=selected.SelectMany(p=>p.Value.Records.Values).Select(r=>r.Part).ToHashSet(StringComparer.Ordinal);
            var protectedParts=new HashSet<string>(StringComparer.Ordinal);
            var cleanVersions=baseline.Values.Select(e=>e.Version).ToHashSet(StringComparer.Ordinal);
            foreach(var pair in entries)
                if(!selectedPaths.Contains(pair.Key) || IsPinned(pair.Key,pair.Value) || open.ContainsKey(pair.Value.Id) || !cleanVersions.Contains(pair.Value.Version))
                    protectedParts.UnionWith(pair.Value.Records.Values.Select(r=>r.Part));
            foreach(var orphan in orphans.Values)protectedParts.UnionWith(orphan.Records.Values.Select(r=>r.Part));
            foreach(var id in pending)protectedParts.UnionWith(Parts(ReadMetadata<Commit>(ObjectPath(cache,"commits",id),"commit",id)));
            candidates.ExceptWith(protectedParts);

            // A failure during source verification leaves the cache intact.
            var eligible=new List<(string Path,long Length)>();
            try
            {
                foreach(var id in candidates.Order(StringComparer.Ordinal))
                {
                    var local=ObjectPath(cache,"parts",id); var remote=ObjectPath(source,"parts",id);
                    if(!File.Exists(local)||!File.Exists(remote))continue;
                    VerifyPart(remote,id); eligible.Add((local,new FileInfo(local).Length));
                }
            }
            catch(Exception ex) when(ex is IOException or UnauthorizedAccessException)
            {
                sourceAvailable=Directory.Exists(source); lastError=ex.Message; return 0;
            }
            long removed=0;
            foreach(var part in eligible) { VaultCrypto.ValidatePhysicalPath(part.Path); File.Delete(part.Path); removed=checked(removed+part.Length); }
            return removed;
        }
    }

    /// <summary>Evicts only published, closed, unpinned content. Cloud objects are never garbage-collected.</summary>
    public long EvictCache(long desiredBytes)
    {
        lock(gate)
        {
            Check(); if(desiredBytes<0)throw new ArgumentOutOfRangeException(nameof(desiredBytes)); var protectedParts=new HashSet<string>();
            foreach(var pair in entries)if(IsPinned(pair.Key,pair.Value)||open.ContainsKey(pair.Value.Id)||!baseline.Values.Any(b=>b.Version==pair.Value.Version))protectedParts.UnionWith(pair.Value.Records.Values.Select(r=>r.Part));
            foreach(var e in orphans.Values)protectedParts.UnionWith(e.Records.Values.Select(r=>r.Part));
            foreach(var id in pending)protectedParts.UnionWith(Parts(ReadMetadata<Commit>(ObjectPath(cache,"commits",id),"commit",id)));
            VaultCrypto.ValidatePhysicalPath(Path.Combine(cache,"parts")); long removed=0; foreach(var path in Directory.EnumerateFiles(Path.Combine(cache,"parts"),"*.mfe")) { if(removed>=desiredBytes)break; var id=Path.GetFileNameWithoutExtension(path); if(protectedParts.Contains(id)||!sourceAvailable||!File.Exists(ObjectPath(source,"parts",id)))continue; VerifyPart(ObjectPath(source,"parts",id),id); var size=new FileInfo(path).Length;File.Delete(path);removed+=size; } return removed;
        }
    }
    public void Dispose() { lock(gate) { if(disposed)return; try { FlushLocal(); } finally { disposed=true;CryptographicOperations.ZeroMemory(key); } } }
}
