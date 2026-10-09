using System.Security.Cryptography;
namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    private Dictionary<string,DateTimeOffset> versionDue=[];
    private List<StoredVersion> pendingVersions=[];
    private HashSet<string> hiddenBin=[];
    private HashSet<string> pendingBinHidden=[];
    public event Action? HistoryChanged;
    public int PendingVersionCount { get { lock(gate)return versionDue.Count; } }
    public int StorageFormat => config.Format;
    public Func<string,bool>? IsEncryptedFileAvailable { get; set; }
    private bool PartAvailable(string id) => File.Exists(ObjectPath(cache,"parts",id))||File.Exists(ObjectPath(source,"parts",id))||IsEncryptedFileAvailable?.Invoke("parts/"+id+".mfe")==true;
    public Func<string,CancellationToken,Task>? HydrateEncryptedFileAsync { get; set; }
    public IReadOnlyList<string> GetEncryptedSnapshotPaths()
    {
        lock(gate) { Check(); return known.Select(id=>"commits/"+id+".mfe").Concat(known.SelectMany(id=>Parts(ReadMetadata<Commit>(ObjectPath(cache,"commits",id),"commit",id))).Distinct().Select(id=>"parts/"+id+".mfe")).Prepend("vault.json").ToArray(); }
    }
    private void MarkDue(Entry e) => versionDue[e.Id]=DateTimeOffset.UtcNow.AddSeconds(30);
    private void CaptureVersion(string path,Entry entry,bool deleted,string? deletionBatch=null)
    {
        var ancestors=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);if(deleted)for(var parent=VaultPath.Parent(path);parent!="";parent=VaultPath.Parent(parent))if(entries.TryGetValue(parent,out var directory))ancestors[parent]=directory.Id;
        pendingVersions.Add(new StoredVersion {Ancestors=ancestors, Path=path,Value=Clone(entry),Deleted=deleted,DeletionBatch=deleted?deletionBatch??Guid.NewGuid().ToString("N"):"" });
    }
    private List<StoredVersion> AllVersions()
    {
        var result=new List<StoredVersion>();
        foreach(var id in known.Order(StringComparer.Ordinal))
        {
            var commit=ReadMetadata<Commit>(ObjectPath(cache,"commits",id),"commit",id);
            result.AddRange(commit.Versions); hiddenBin.UnionWith(commit.BinHiddenIds);
        }
        result.AddRange(pendingVersions);return result;
    }
    private VaultVersionInfo VersionInfo(StoredVersion v) => new(v.Id,v.Value.Id,v.Path,v.Timestamp,v.Value.Length,v.Value.Directory,v.Deleted,v.Value.Records.Values.All(r=>PartAvailable(r.Part)));
    public IReadOnlyList<VaultVersionInfo> ListVersions(string? entryId=null,int? retentionDays=null)
    {
        lock(gate) { Check(); if(retentionDays<0)throw new ArgumentOutOfRangeException(nameof(retentionDays));var cutoff=retentionDays.HasValue?DateTimeOffset.UtcNow.AddDays(-retentionDays.Value):DateTimeOffset.MinValue;return AllVersions().Where(v=>(entryId==null||v.Value.Id==entryId)&&v.Timestamp>=cutoff).OrderByDescending(v=>v.Timestamp).Select(VersionInfo).ToArray(); }
    }
    public IReadOnlyList<VaultVersionInfo> ListDeleted()
    {
        lock(gate) { Check();var deleted=AllVersions().Where(v=>v.Deleted&&!hiddenBin.Contains(v.Id)).OrderByDescending(v=>v.Timestamp).ToArray();return deleted.Select(v=>VersionInfo(v) with {DescendantIds=v.Value.Directory?deleted.Where(child=>child.Id!=v.Id&&child.DeletionBatch!=v.DeletionBatch&&child.Ancestors.TryGetValue(v.Path,out var ancestorId)&&ancestorId==v.Value.Id).Select(child=>child.Id).ToArray():[]}).ToArray(); }
    }
    public Task SaveVersionAsync(string? path=null,CancellationToken cancellationToken=default)
    {
        lock(gate) { Check();cancellationToken.ThrowIfCancellationRequested();var selected=path==null?entries.ToArray():entries.Where(p=>p.Key.Equals(VaultPath.Normalize(path),StringComparison.OrdinalIgnoreCase)||p.Key.StartsWith(VaultPath.Normalize(path)+"/",StringComparison.OrdinalIgnoreCase)).ToArray();if(path!=null&&selected.Length==0)throw new FileNotFoundException();foreach(var pair in selected){CaptureVersion(pair.Key,pair.Value,false);versionDue.Remove(pair.Value.Id);}FlushLocal();Publish(cancellationToken);SaveJournal();return Task.CompletedTask; }
    }
    public Task SaveDueVersionsAsync(DateTimeOffset now,CancellationToken cancellationToken=default)
    {
        lock(gate) { Check();cancellationToken.ThrowIfCancellationRequested();var dueEntries=entries.Where(p=>versionDue.TryGetValue(p.Value.Id,out var due)&&due<=now).ToArray();if(dueEntries.Length==0)return Task.CompletedTask;foreach(var pair in dueEntries){cancellationToken.ThrowIfCancellationRequested();CaptureVersion(pair.Key,pair.Value,false);versionDue.Remove(pair.Value.Id);}FlushLocal();Publish(cancellationToken);SaveJournal();return Task.CompletedTask; }
    }
    private string Restore(StoredVersion version,bool restoreCurrent=false)
    {
        foreach(var record in version.Value.Records){var plain=ReadChunk(version.Value,record.Key);CryptographicOperations.ZeroMemory(plain);}
        var path=version.Path;
        for(var parent=VaultPath.Parent(path);parent!="";parent=VaultPath.Parent(parent)) if(entries.TryGetValue(parent,out var existing)&&!existing.Directory)throw new IOException("Restore parent is occupied by a file.");
        var parents=new Stack<string>();for(var parent=VaultPath.Parent(path);parent!="";parent=VaultPath.Parent(parent))parents.Push(parent);
        while(parents.Count>0){var parent=parents.Pop();if(!entries.ContainsKey(parent))CreateDirectory(parent);}
        if(entries.TryGetValue(path,out var current))
        {
            if(restoreCurrent&&current.Id==version.Value.Id&&current.Directory==version.Value.Directory)CaptureVersion(path,current,false);
            else path=ConflictPath(path,version.Id,entries);
        }
        var restored=Clone(version.Value);if(entries.Any(p=>!p.Key.Equals(path,StringComparison.OrdinalIgnoreCase)&&p.Value.Id==restored.Id))restored.Id=Guid.NewGuid().ToString("N");Touch(restored);entries[path]=restored;versionDue.Remove(restored.Id);CaptureVersion(path,restored,false);return path;
    }
    public Task RestoreVersionAsync(string versionId,CancellationToken cancellationToken=default)
    {
        lock(gate){Check();cancellationToken.ThrowIfCancellationRequested();var version=AllVersions().SingleOrDefault(v=>v.Id==versionId)??throw new FileNotFoundException("Version not found.");Restore(version,true);FlushLocal();Publish(cancellationToken);SaveJournal();return Task.CompletedTask;}
    }
    public Task RestoreDeletedAsync(IReadOnlyList<string> ids,CancellationToken cancellationToken=default)
    {
        lock(gate){Check();var all=AllVersions();var selected=all.Where(v=>v.Deleted&&!hiddenBin.Contains(v.Id)&&(ids.Contains(v.Id)||all.Any(root=>ids.Contains(root.Id)&&root.Deleted&&root.Value.Directory&&(root.DeletionBatch!=""&&v.DeletionBatch==root.DeletionBatch)&&v.Path.StartsWith(root.Path+"/",StringComparison.OrdinalIgnoreCase)))).OrderBy(v=>v.Path.Count(c=>c=='/')).ToArray();foreach(var selectedVersion in selected)foreach(var record in selectedVersion.Value.Records){cancellationToken.ThrowIfCancellationRequested();var content=ReadChunk(selectedVersion.Value,record.Key);CryptographicOperations.ZeroMemory(content);}
            var oldEntries=CloneEntries(entries);var oldVersions=pendingVersions.ToList();var oldHidden=new HashSet<string>(hiddenBin);var oldPendingHidden=new HashSet<string>(pendingBinHidden);var oldDue=new Dictionary<string,DateTimeOffset>(versionDue);
            try{var remapped=new List<(string Batch,string EntryId,string Path,string Restored)>();foreach(var v in selected){cancellationToken.ThrowIfCancellationRequested();var originalPath=v.Path;var copy=new StoredVersion {Id=v.Id,Path=v.Path,Value=v.Value,Timestamp=v.Timestamp,Deleted=v.Deleted};var parentMapping=remapped.Where(p=>(p.Batch==v.DeletionBatch||(v.Ancestors.TryGetValue(p.Path,out var parentId)&&parentId==p.EntryId))&&originalPath.StartsWith(p.Path+"/",StringComparison.OrdinalIgnoreCase)).OrderByDescending(p=>p.Path.Length).FirstOrDefault();if(parentMapping.Path!=null)copy.Path=parentMapping.Restored+originalPath[parentMapping.Path.Length..];var restoredPath=Restore(copy);if(v.Value.Directory)remapped.Add((v.DeletionBatch,v.Value.Id,originalPath,restoredPath));hiddenBin.Add(v.Id);pendingBinHidden.Add(v.Id);}}catch{entries=oldEntries;pendingVersions=oldVersions;hiddenBin=oldHidden;pendingBinHidden=oldPendingHidden;versionDue=oldDue;throw;}FlushLocal();Publish(cancellationToken);SaveJournal();return Task.CompletedTask;}
    }
    public Task EmptyRecycleBinAsync(CancellationToken cancellationToken=default)
    {
        lock(gate){Check();cancellationToken.ThrowIfCancellationRequested();foreach(var v in AllVersions().Where(v=>v.Deleted)){hiddenBin.Add(v.Id);pendingBinHidden.Add(v.Id);}FlushLocal();Publish(cancellationToken);SaveJournal();return Task.CompletedTask;}
    }
    public Task<VaultEngine> CopyUpgradeAsync(VaultOptions destination,VaultCredentials credentials,CancellationToken cancellationToken=default)
    {
        lock(gate)
        {
            Check();var destinationRoots=new[]{Path.GetFullPath(destination.StorageRoot),Path.GetFullPath(destination.CacheRoot)};foreach(var root in destinationRoots)RejectReparseAncestors(root);foreach(var original in new[]{source,cache})foreach(var candidate in destinationRoots)if(IsWithin(candidate,original)||IsWithin(original,candidate))throw new ArgumentException("Upgrade storage and cache must be separate from both original folders.");
            var target=Create(destination,credentials);
            try
            {
                Entry ConvertEntry(Entry original)
                {
                    var converted=Clone(original);converted.Records=[];converted.ChunkSize=target.ChunkBytes(target.partSize);converted.PartSize=target.partSize;
                    if(!original.Directory){var targets=new SortedSet<long>();foreach(var index in original.Records.Keys){var start=checked(index*original.ChunkSize);var end=Math.Min(original.Length,start+original.ChunkSize);for(var chunk=start/converted.ChunkSize;end>start&&chunk<=(end-1)/converted.ChunkSize;chunk++)targets.Add(chunk);}using var writer=new PartWriter(target);foreach(var chunk in targets){var offset=chunk*converted.ChunkSize;cancellationToken.ThrowIfCancellationRequested();var buffer=new byte[(int)Math.Min(converted.ChunkSize,original.Length-offset)];try{Read(original,offset,buffer);converted.Records[offset/converted.ChunkSize]=writer.Add(buffer);}finally{CryptographicOperations.ZeroMemory(buffer);}}writer.Finish();}
                    return converted;
                }
                foreach(var pair in entries)target.entries[pair.Key]=ConvertEntry(pair.Value);
                foreach(var version in AllVersions()){var copy=new StoredVersion {Id=version.Id,Path=version.Path,Value=ConvertEntry(version.Value),Timestamp=version.Timestamp,Deleted=version.Deleted,DeletionBatch=version.DeletionBatch,Ancestors=new(version.Ancestors)};target.pendingVersions.Add(copy);}
                target.hiddenBin.UnionWith(hiddenBin);target.pendingBinHidden.UnionWith(hiddenBin);target.FlushLocal();target.Publish(cancellationToken);
                if(target.pending.Count!=0)throw new IOException("Upgrade destination could not be published.");
                foreach(var id in target.known){var commit=target.ReadMetadata<Commit>(target.ObjectPath(target.source,"commits",id),"commit",id);target.VerifyComplete(commit);foreach(var part in target.Parts(commit))target.VerifyPart(target.ObjectPath(target.source,"parts",part),part);}
                target.SaveJournal();return Task.FromResult(target);
            }
            catch{target.Dispose();throw;}
        }
    }

}
