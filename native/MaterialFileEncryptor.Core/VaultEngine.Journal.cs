using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    private const int LogHeaderSize=80;
    private readonly List<JournalMutation> journalMutations=[];
    private long logSequence,logLength,appendedBytes,appendedFrames,checkpointBytes,checkpointCount,checkpointHighWater;
    private byte[] logDigest=new byte[32];
    private string LogPath => Path.Combine(cache,"journal.log.mfe");
    public VaultJournalStatistics JournalStatistics { get { lock(gate)return new(appendedBytes,appendedFrames,checkpointBytes,checkpointCount,Math.Max(0,logSequence-checkpointHighWater)+journalMutations.Count); } }
    private static Entry MetadataOnly(Entry entry) => new() { Id=entry.Id,Version=entry.Version,Directory=entry.Directory,Length=entry.Length,ChunkSize=entry.ChunkSize,PartSize=entry.PartSize,Created=entry.Created,Modified=entry.Modified,Attributes=entry.Attributes,OverlaySize=entry.OverlaySize,BaseLength=entry.BaseLength };
    private void TrackEntry(Entry entry,Dictionary<long,RecordRef>? records=null,bool overlay=false,long? truncate=null)
    {
        // Open deleted handles have process-local lifetimes and must never resurrect a path.
        if(orphans.TryGetValue(entry.Id,out var orphan)&&ReferenceEquals(orphan,entry))return;
        journalMutations.Add(new JournalMutation { Kind="update",Id=entry.Id,Metadata=MetadataOnly(entry),Records=records??[],Overlay=overlay,TruncateOverlayAt=truncate,Due=versionDue.GetValueOrDefault(entry.Id) });
    }
    private byte[] HeaderMac(ReadOnlySpan<byte> header)
    {
        var domain=Encoding.UTF8.GetBytes(Domain("local-journal-header"));
        var input=new byte[domain.Length+header.Length];domain.CopyTo(input,0);header.CopyTo(input.AsSpan(domain.Length));
        try { return HMACSHA256.HashData(key,input); } finally { CryptographicOperations.ZeroMemory(input); }
    }
    private void AppendJournal()
    {
        if(journalMutations.Count==0)return;
        VaultCrypto.ValidatePhysicalPath(LogPath);
        using var stream=new FileStream(LogPath,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.Read,65536,FileOptions.WriteThrough);
        if(stream.Length<logLength)throw new InvalidDataException("Local journal was unexpectedly truncated.");
        stream.SetLength(logLength);stream.Position=logLength;
        var completed=0;
        try
        {
            foreach(var mutation in journalMutations)
            {
                var next=checked(logSequence+1);var plain=VaultCrypto.Serialize(mutation);byte[] encrypted;
                try { if(plain.Length>VaultCrypto.MaxMetadata)throw new IOException("Local mutation exceeds supported size.");encrypted=VaultCrypto.Seal(plain,key,Domain("local-journal",next+"/"+Convert.ToHexString(logDigest))); }
                finally { CryptographicOperations.ZeroMemory(plain); }
                var header=new byte[LogHeaderSize];"MFJL"u8.CopyTo(header);BinaryPrimitives.WriteInt64LittleEndian(header.AsSpan(4),next);BinaryPrimitives.WriteInt32LittleEndian(header.AsSpan(12),encrypted.Length);logDigest.CopyTo(header,16);HeaderMac(header.AsSpan(0,48)).CopyTo(header,48);
                stream.Write(header);stream.Write(encrypted);stream.Flush(true);
                logSequence=next;logLength=stream.Position;
                using(var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256)) { hash.AppendData(header);hash.AppendData(encrypted);logDigest=hash.GetHashAndReset(); }
                appendedBytes+=header.Length+encrypted.Length;appendedFrames++;completed++;
            }
        }
        finally { if(completed>0)journalMutations.RemoveRange(0,completed); }
    }
    private void ReplayJournal(long checkpointSequence,string checkpointDigest)
    {
        logSequence=checkpointSequence;checkpointHighWater=checkpointSequence;
        logDigest=checkpointDigest.Length==0?new byte[32]:Convert.FromHexString(checkpointDigest);
        if(logSequence<0||logDigest.Length!=32)throw new InvalidDataException("Invalid local journal checkpoint.");
        if(!File.Exists(LogPath))return;
        VaultCrypto.ValidatePhysicalPath(LogPath);
        using var stream=new FileStream(LogPath,FileMode.Open,FileAccess.ReadWrite,FileShare.Read);
        long previous=0;byte[] previousDigest=new byte[32];bool first=true,checkpointSeen=checkpointSequence==0;
        while(stream.Position<stream.Length)
        {
            var start=stream.Position;
            if(stream.Length-start<LogHeaderSize)break;
            var header=new byte[LogHeaderSize];stream.ReadExactly(header);
            if(!header.AsSpan(0,4).SequenceEqual("MFJL"u8)||!CryptographicOperations.FixedTimeEquals(HeaderMac(header.AsSpan(0,48)),header.AsSpan(48,32)))throw new CryptographicException("Local journal header authentication failed.");
            var sequence=BinaryPrimitives.ReadInt64LittleEndian(header.AsSpan(4));var length=BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan(12));
            if(length<VaultCrypto.Overhead||length>VaultCrypto.MaxMetadata+VaultCrypto.Overhead)throw new InvalidDataException("Invalid local journal frame length.");
            if(first)
            {
                if(sequence==checkpointSequence+1) { previous=checkpointSequence;previousDigest=logDigest.ToArray();checkpointSeen=true; }
                else if(sequence!=1)throw new InvalidDataException("Local journal starts at an invalid sequence.");
                first=false;
            }
            if(sequence!=previous+1||!CryptographicOperations.FixedTimeEquals(previousDigest,header.AsSpan(16,32)))throw new CryptographicException("Local journal sequence or chain mismatch.");
            if(stream.Length-stream.Position<length) { stream.Position=start;break; }
            var encrypted=new byte[length];stream.ReadExactly(encrypted);
            var plain=VaultCrypto.Unseal(encrypted,key,Domain("local-journal",sequence+"/"+Convert.ToHexString(previousDigest)),VaultCrypto.MaxMetadata);
            JournalMutation mutation;
            try { mutation=VaultCrypto.Deserialize<JournalMutation>(plain); } finally { CryptographicOperations.ZeroMemory(plain); }
            using(var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256)) { hash.AppendData(header);hash.AppendData(encrypted);previousDigest=hash.GetHashAndReset(); }
            previous=sequence;
            if(sequence==checkpointSequence) { if(!CryptographicOperations.FixedTimeEquals(previousDigest,logDigest))throw new CryptographicException("Local journal checkpoint chain mismatch.");checkpointSeen=true; }
            if(sequence>checkpointSequence) { ApplyJournalMutation(mutation);logSequence=sequence;logDigest=previousDigest.ToArray(); }
            logLength=stream.Position;
        }
        if(!first&&!checkpointSeen)throw new InvalidDataException("Local journal does not reach its checkpoint.");
        // Only a short terminal frame is discarded; authenticated complete frames fail closed.
        if(stream.Length!=logLength) { stream.SetLength(logLength);stream.Flush(true); }
        ValidateEntries(entries);
    }
    private void ApplyJournalMutation(JournalMutation mutation)
    {
        if(mutation.Kind=="create")
        {
            var path=VaultPath.Normalize(mutation.Path);if(path==""||mutation.Metadata==null||entries.ContainsKey(path))throw new InvalidDataException("Invalid local create mutation.");
            entries[path]=mutation.Metadata;return;
        }
        if(mutation.Kind=="delete")
        {
            var path=VaultPath.Normalize(mutation.Path);if(!entries.TryGetValue(path,out var target)||target.Id!=mutation.Id)throw new InvalidDataException("Invalid local delete mutation.");
            entries.Remove(path);versionDue.Remove(mutation.Id);if(mutation.Version!=null)pendingVersions.Add(mutation.Version);return;
        }
        if(mutation.Kind=="rename")
        {
            var path=VaultPath.Normalize(mutation.Path);var destination=VaultPath.Normalize(mutation.Destination);
            if(path==""||destination==""||!entries.TryGetValue(path,out var target)||target.Id!=mutation.Id)throw new InvalidDataException("Invalid local rename mutation.");
            var moved=entries.Where(p=>p.Key.Equals(path,StringComparison.OrdinalIgnoreCase)||p.Key.StartsWith(path+"/",StringComparison.OrdinalIgnoreCase)).ToArray();
            foreach(var item in moved)entries.Remove(item.Key);
            foreach(var item in moved) { var next=destination+item.Key[path.Length..];if(entries.ContainsKey(next))throw new InvalidDataException("Local rename destination is occupied.");entries.Add(next,item.Value); }return;
        }
        if(mutation.Kind!="update"||mutation.Metadata==null)throw new InvalidDataException("Unknown local journal mutation.");
        var entry=entries.Values.FirstOrDefault(e=>e.Id==mutation.Id)??throw new InvalidDataException("Local update entry is absent.");
        var replacement=mutation.Metadata;if(replacement.Id!=entry.Id)throw new InvalidDataException("Local update identity mismatch.");
        replacement.Records=entry.Records;replacement.Overlays=entry.Overlays;
        if(mutation.TruncateOverlayAt is long limit)foreach(var index in replacement.Overlays.Keys.Where(i=>i>=limit).ToArray())replacement.Overlays.Remove(index);
        var records=mutation.Overlay?replacement.Overlays:replacement.Records;foreach(var pair in mutation.Records)records[pair.Key]=pair.Value;
        var pathKey=entries.First(p=>ReferenceEquals(p.Value,entry)).Key;entries[pathKey]=replacement;
        if(mutation.Due is DateTimeOffset due&&due!=default)versionDue[entry.Id]=due;
    }
    private void SaveJournalCheckpoint()
    {
        revision++;
        var path=Path.Combine(cache,"journal.mfe");
        WriteMetadata(path,new Journal { LogSequence=logSequence,LogDigest=Convert.ToHexString(logDigest),PartSize=partSize,Entries=entries,Baseline=baseline,Pending=pending,Known=known,Heads=heads,Pinned=pinned,VersionDue=versionDue,PendingVersions=pendingVersions,HiddenBin=hiddenBin },"journal","");
        checkpointBytes+=new FileInfo(path).Length;checkpointCount++;checkpointHighWater=logSequence;
        journalMutations.Clear();
        // The durable checkpoint is authoritative before the obsolete prefix is removed.
        try { VaultCrypto.AtomicWrite(LogPath,ReadOnlySpan<byte>.Empty);logLength=0; }
        catch(Exception ex) when(ex is IOException or UnauthorizedAccessException)
        {
            // The checkpoint is already durable. Retain the authenticated prefix
            // and its known length; replay skips it through the saved highwater.
            // Reporting failure here would invite rollback of a committed mutation.
        }
    }
}
