using System.Security.Cryptography;
namespace MaterialFileEncryptor.Core;

/// <summary>Signals that immutable encrypted files must be prepared outside caller locks before retrying.</summary>
public sealed class VaultHydrationRequiredException(IReadOnlyList<string> relativePaths) : Exception("Encrypted content requires preparation outside filesystem and engine locks.")
{
    public IReadOnlyList<string> RelativePaths { get; } = relativePaths;
}
public sealed partial class VaultEngine
{
    private bool HasPhysicalPart(string id) => File.Exists(ObjectPath(cache,"parts",id))||File.Exists(ObjectPath(source,"parts",id));
    private void RequireAvailable(IEnumerable<RecordRef> records)
    {
        var missing=records.Select(r=>r.Part).Distinct(StringComparer.Ordinal).Where(id=>!HasPhysicalPart(id)).Select(id=>"parts/"+id+".mfe").ToArray();
        if(missing.Length==0)return;
        if(HydrateEncryptedFileAsync!=null)throw new VaultHydrationRequiredException(missing);
        throw new IOException("Encrypted content is unavailable offline.");
    }
    private static IEnumerable<RecordRef> RangeRecords(Entry e,long offset,long length)
    {
        if(offset<0||length<0||offset>long.MaxValue-length)throw new ArgumentOutOfRangeException(nameof(offset));
        if(length==0||e.Directory)return [];
        var end=offset+length;
        var records=new List<RecordRef>();
        var size=e.OverlaySize>0?e.OverlaySize:e.ChunkSize;
        for(var position=offset;position<end;)
        {
            var index=position/size; var next=Math.Min(end,(index+1)*size);
            if(e.Overlays.TryGetValue(index,out var overlay))records.Add(overlay);
            else if(position<(e.BaseLength??e.Length))
            {
                var baseEnd=Math.Min(next,e.BaseLength??e.Length);
                var first=position/e.ChunkSize;var last=(baseEnd-1)/e.ChunkSize;
                for(var block=first;block<=last;block++)if(e.Records.TryGetValue(block,out var record))records.Add(record);
            }
            position=next;
        }
        return records;
    }
    private async Task PrepareAsync(Func<IEnumerable<(string Identity,Entry Entry,IEnumerable<RecordRef> Records)>> snapshot,CancellationToken token)
    {
        for(var attempt=0;attempt<3;attempt++)
        {
            (string Identity,Entry Entry,IEnumerable<RecordRef> Records)[] selected;string[] missing;Func<string,CancellationToken,Task>? hydrate;
            lock(gate)
            {
                Check();token.ThrowIfCancellationRequested();selected=snapshot().Select(x=>(x.Identity,Clone(x.Entry),(IEnumerable<RecordRef>)x.Records.ToArray())).ToArray();
                missing=selected.SelectMany(x=>x.Records).Select(r=>r.Part).Distinct(StringComparer.Ordinal).Where(id=>!HasPhysicalPart(id)).ToArray();hydrate=HydrateEncryptedFileAsync;
            }
            foreach(var id in missing)
            {
                token.ThrowIfCancellationRequested();if(hydrate==null)throw new IOException("Encrypted content is unavailable offline.");
                await hydrate("parts/"+id+".mfe",token).ConfigureAwait(false);
                lock(gate){Check();if(!HasPhysicalPart(id))throw new IOException("Advertised encrypted content could not be hydrated.");}
            }
            lock(gate)
            {
                Check();token.ThrowIfCancellationRequested();var current=snapshot().Select(x=>(x.Identity,x.Entry.Version,string.Join(",",x.Records.Select(r=>r.Part).Order(StringComparer.Ordinal)))).ToArray();
                var previous=selected.Select(x=>(x.Identity,x.Entry.Version,string.Join(",",x.Records.Select(r=>r.Part).Order(StringComparer.Ordinal)))).ToArray();
                if(current.SequenceEqual(previous)){RequireAvailable(selected.SelectMany(x=>x.Records));return;}
            }
        }
        throw new IOException("Vault entries changed repeatedly while preparing encrypted content; retry the operation.");
    }
    public Task PrepareReadRangeAsync(string entryId,long offset,int length,CancellationToken cancellationToken=default) => PrepareAsync(()=>{var e=FindId(entryId);return new[]{(entryId,e,RangeRecords(e,offset,Math.Min(length,Math.Max(0,e.Length-offset))))};},cancellationToken);
    public Task PrepareWriteRangeAsync(string entryId,long offset,int length,CancellationToken cancellationToken=default) => PrepareAsync(()=>{var e=FindId(entryId);return new[]{(entryId,e,RangeRecords(e,offset,length))};},cancellationToken);
    public Task PrepareSetLengthAsync(string entryId,long length,CancellationToken cancellationToken=default) => PrepareAsync(()=>{var e=FindId(entryId);if(length<0)throw new ArgumentOutOfRangeException(nameof(length));return new[]{(entryId,e,RangeRecords(e,length,length<e.Length&&length%e.ChunkSize!=0?1:0))};},cancellationToken);
    public Task PrepareEntryAsync(string entryId,CancellationToken cancellationToken=default) => PrepareAsync(()=>{var e=FindId(entryId);return new[]{(entryId,e,(IEnumerable<RecordRef>)AllRecords(e))};},cancellationToken);
    public Task PreparePinnedAsync(string path,CancellationToken cancellationToken=default) => PrepareAsync(()=>{var normalized=VaultPath.Normalize(path);return entries.Where(p=>normalized==""||p.Key.Equals(normalized,StringComparison.OrdinalIgnoreCase)||p.Key.StartsWith(normalized+"/",StringComparison.OrdinalIgnoreCase)).Select(p=>(p.Value.Id,p.Value,(IEnumerable<RecordRef>)AllRecords(p.Value)));},cancellationToken);
    public Task PrepareVersionsAsync(IReadOnlyList<string> versionIds,bool deleted=false,CancellationToken cancellationToken=default) => PrepareAsync(()=>{var all=AllVersions();return all.Where(v=>versionIds.Contains(v.Id)||(deleted&&v.Deleted&&!hiddenBin.Contains(v.Id)&&all.Any(root=>versionIds.Contains(root.Id)&&root.Deleted&&root.Value.Directory&&root.DeletionBatch!=""&&v.DeletionBatch==root.DeletionBatch&&v.Path.StartsWith(root.Path+"/",StringComparison.OrdinalIgnoreCase)))).Select(v=>(v.Id,v.Value,(IEnumerable<RecordRef>)AllRecords(v.Value)));},cancellationToken);
    public Task PrepareUpgradeAsync(CancellationToken cancellationToken=default) => PrepareAsync(()=>entries.Values.Select(e=>(e.Id,e,(IEnumerable<RecordRef>)AllRecords(e))).Concat(AllVersions().Select(v=>(v.Id,v.Value,(IEnumerable<RecordRef>)AllRecords(v.Value)))),cancellationToken);
}
