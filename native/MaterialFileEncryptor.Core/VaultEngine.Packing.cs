using System.Security.Cryptography;
namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    private Dictionary<string,long> packingQueue=[];
    private readonly Dictionary<string,int> writers=[];
    private readonly Dictionary<string,long> writerGenerations=[];
    private readonly SemaphoreSlim packingWorker=new(1,1);
    private readonly CancellationTokenSource backgroundCancellation=new();
    private int activeStorageOperations;
    private bool packingRunning,packingPaused;
    private long packingRequestGeneration;
    private string? packingError;
    private int packingScheduled;
    public VaultPackingStatus PackingStatus { get { lock(gate)return new(partSize,packingQueue.Count,writers.Values.Sum(),packingRunning,packingError,packingPaused); } }
    internal Action<string>? PackingTestPoint { get; set; }
    internal Action<string>? PublicationTestPoint { get; set; }
    private void QueuePacking(Entry entry)
    {
        if(!entry.Directory && !orphans.ContainsKey(entry.Id))packingQueue[entry.Id]=partSize;
    }
    private IDisposable AcquireStorageOperation()
    {
        lock(gate){Check();activeStorageOperations++;return new StorageOperationLease(this);}
    }
    private sealed class StorageOperationLease(VaultEngine engine):IDisposable
    {
        private bool released;
        public void Dispose(){lock(engine.gate){if(released)return;released=true;if(--engine.activeStorageOperations==0&&engine.disposed)CryptographicOperations.ZeroMemory(engine.key);}}
    }
    private void CancelBackground()=>backgroundCancellation.Cancel();
    private sealed class WriterLease(VaultEngine engine,string id,IDisposable opened):IDisposable
    {
        private bool released;
        public void Dispose()
        {
            bool schedule=false;
            lock(engine.gate)
            {
                if(released)return;released=true;
                int count=engine.writers[id];if(count==1){engine.writers.Remove(id);schedule=engine.packingQueue.ContainsKey(id);}else engine.writers[id]=count-1;
                opened.Dispose();
            }
            if(schedule)engine.SchedulePacking();
        }
    }
    /// <summary>Keep this lease through final Close, including retained mapped views.</summary>
    public IDisposable AcquireWriterById(string id)
    {
        lock(gate)
        {
            Check();var entry=FindId(id);if(entry.Directory)return AcquireOpenById(id);
            var opened=AcquireOpenById(id);writers[id]=writers.GetValueOrDefault(id)+1;
            writerGenerations[id]=checked(writerGenerations.GetValueOrDefault(id)+1);
            return new WriterLease(this,id,opened);
        }
    }
    public void ResumePacking(){lock(gate){Check();if(packingPaused||!packingQueue.Any(p=>writers.GetValueOrDefault(p.Key)==0))return;}SchedulePacking();}
    private void SchedulePacking()
    {
        lock(gate){if(disposed||packingPaused)return;}
        if(Interlocked.CompareExchange(ref packingScheduled,1,0)!=0)return;
        _=Task.Run(async()=>
        {
            try{await ProcessPackingQueueAsync(backgroundCancellation.Token).ConfigureAwait(false);}
            catch(OperationCanceledException)when(backgroundCancellation.IsCancellationRequested){}
            catch(ObjectDisposedException){}
            catch{lock(gate)packingError="Encrypted packing could not finish. Original data remains available; retry packing.";}
            finally{Interlocked.Exchange(ref packingScheduled,0);}
        });
    }
    /// <summary>Durably queues current files. Repeating after interruption skips already packed generations.</summary>
    public async Task<long> PackAsync(string? path=null,long? newPartSize=null,CancellationToken cancellationToken=default,IProgress<VaultPackingProgress>? progress=null)
    {
        using var lifetime=AcquireStorageOperation();long request;
        lock(gate)
        {
            Check();cancellationToken.ThrowIfCancellationRequested();long cap=newPartSize??partSize;ValidatePartSize(cap);
            string? normalized=path==null?null:VaultPath.Normalize(path);
            if(normalized is not null && normalized!="")Find(normalized);
            var selected=entries.Where(p=>!p.Value.Directory&&(normalized==null||normalized==""||p.Key.Equals(normalized,StringComparison.OrdinalIgnoreCase)||p.Key.StartsWith(normalized+"/",StringComparison.OrdinalIgnoreCase))).ToArray();
            var savedQueue=new Dictionary<string,long>(packingQueue);long savedCap=partSize;bool savedPause=packingPaused;
            request=++packingRequestGeneration;packingPaused=false;
            try
            {
                if(normalized is null||normalized=="")partSize=cap;
                foreach(var pair in selected)if(!IsPacked(pair.Value,cap)||packingQueue.ContainsKey(pair.Value.Id))packingQueue[pair.Value.Id]=cap;
                SaveJournal();
            }
            catch{packingQueue=savedQueue;partSize=savedCap;packingPaused=savedPause;throw;}
        }
        try{await ProcessPackingQueueAsync(cancellationToken,progress).ConfigureAwait(false);return request;}
        catch(OperationCanceledException){PausePacking(request);throw;}
    }
    public void PausePacking(long generation)=>PausePacking((long?)generation);
    private void PausePacking(long? generation)
    {
        lock(gate)
        {
            if(disposed||generation.HasValue&&generation.Value!=packingRequestGeneration)return;
            bool previous=packingPaused;packingPaused=true;
            try{SaveJournal();}catch{packingPaused=previous;throw;}
        }
    }
    // Record offsets, lengths and ordering prove packing without reading cloud file metadata.
    private static bool IsPacked(Entry entry,long cap)
    {
        if(entry.PartSize!=cap||entry.Overlays.Count!=0||entry.OverlaySize!=0||entry.BaseLength!=null)return false;
        string? previous=null;long end=0;var seen=new HashSet<string>();
        foreach(var record in entry.Records.OrderBy(p=>p.Key).Select(p=>p.Value))
        {
            if(record.Encoding!=3)return false;
            if(record.Part!=previous)
            {
                if(previous!=null && end+record.RecordLength<=cap)return false;
                if(!seen.Add(record.Part)||record.Offset!=0)return false;
                previous=record.Part;end=0;
            }
            if(record.Offset!=end||record.RecordLength>cap-end)return false;
            end+=record.RecordLength;
        }
        return true;
    }
    public async Task ProcessPackingQueueAsync(CancellationToken cancellationToken=default,IProgress<VaultPackingProgress>? progress=null)
    {
        using var lifetime=AcquireStorageOperation();
        using var linked=CancellationTokenSource.CreateLinkedTokenSource(cancellationToken,backgroundCancellation.Token);
        var token=linked.Token;
        await packingWorker.WaitAsync(token).ConfigureAwait(false);
        try
        {
            (string Id,long Cap,long Length)[] work;
            lock(gate)
            {
                Check();if(packingPaused)return;packingRunning=true;packingError=null;
                work=packingQueue.Select(p=>(Id:p.Key,Cap:p.Value,Entry:entries.Values.FirstOrDefault(e=>e.Id==p.Key))).Where(p=>p.Entry!=null&&!p.Entry.Directory).Select(p=>(p.Id,p.Cap,p.Entry!.Length)).ToArray();
            }
            long total=work.Sum(p=>p.Length),completedBytes=0;int completed=0;
            foreach(var item in work)
            {
                token.ThrowIfCancellationRequested();
                var prefix=completedBytes;var count=completed;
                bool adopted=await PackOneAsync(item.Id,item.Cap,token,bytes=>progress?.Report(new("packing",prefix+bytes,total,count,work.Length))).ConfigureAwait(false);
                if(adopted){completedBytes+=item.Length;completed++;}
                progress?.Report(new("packing",completedBytes,total,completed,work.Length));
            }
        }
        catch(OperationCanceledException){throw;}
        catch{lock(gate)packingError="Encrypted packing could not finish. Original data remains available; retry packing.";throw;}
        finally{lock(gate)packingRunning=false;packingWorker.Release();}
    }
    private async Task<bool> PackOneAsync(string id,long cap,CancellationToken token,Action<long> progress)
    {
        Entry original;string path,pin=Guid.NewGuid().ToString("N");long generation;
        lock(gate)
        {
            Check();token.ThrowIfCancellationRequested();
            var pair=entries.FirstOrDefault(p=>p.Value.Id==id);
            if(pair.Key==null||orphans.ContainsKey(id)||writers.GetValueOrDefault(id)!=0||packingQueue.GetValueOrDefault(id)!=cap)return false;
            original=Clone(pair.Value);path=pair.Key;generation=writerGenerations.GetValueOrDefault(id);
            if(IsPacked(original,cap)){packingQueue.Remove(id);try{SaveJournal();}catch{packingQueue[id]=cap;throw;}return true;}
            readSnapshots.Add(pin,original);
        }
        try
        {
            // Pin immutable source maps and engine key lifetime, but never hold the
            // namespace lock across hydration, authentication or ciphertext writes.
            PackingTestPoint?.Invoke("snapshot");
            foreach(var part in AllRecords(original).Select(r=>r.Part).Distinct(StringComparer.Ordinal))
            {
                token.ThrowIfCancellationRequested();
                if(!HasPhysicalPart(part))
                {
                    var hydrate=HydrateEncryptedFileAsync??throw new IOException("Encrypted content is unavailable offline.");
                    await hydrate("parts/"+part+".mfe",token).ConfigureAwait(false);
                }
            }
            var replacement=Clone(original);
            Repack(replacement,cap,token,progress);
            PackingTestPoint?.Invoke("packed");
            lock(gate)
            {
                Check();token.ThrowIfCancellationRequested();
                if(!entries.TryGetValue(path,out var current)||current.Id!=id||current.Version!=original.Version||orphans.ContainsKey(id)||writers.GetValueOrDefault(id)!=0||writerGenerations.GetValueOrDefault(id)!=generation||packingQueue.GetValueOrDefault(id)!=cap)return false;
                // Old writes are durable first. The full checkpoint replaces both
                // base and overlay maps, rather than merging new records into old ones.
                AppendJournal();
                var savedVersions=pendingVersions.ToList();var savedDue=new Dictionary<string,DateTimeOffset>(versionDue);
                CaptureVersion(path,current,false);
                replacement.Version=Guid.NewGuid().ToString("N");entries[path]=replacement;packingQueue.Remove(id);revision++;
                try{PackingTestPoint?.Invoke("before-adoption");SaveJournal();}
                catch{entries[path]=current;packingQueue[id]=cap;pendingVersions=savedVersions;versionDue=savedDue;throw;}
                PackingTestPoint?.Invoke("adopted");
                return true;
            }
        }
        finally{lock(gate)readSnapshots.Remove(pin);}
    }
    public VaultStorageDiagnostics GetStorageDiagnostics()
    {
        using var lifetime=AcquireStorageOperation();HashSet<string> current,history;string[] commits;VaultPackingStatus status;
        lock(gate){Check();current=entries.Values.SelectMany(AllRecords).Select(r=>r.Part).ToHashSet(StringComparer.Ordinal);history=pendingVersions.SelectMany(v=>AllRecords(v.Value)).Select(r=>r.Part).ToHashSet(StringComparer.Ordinal);commits=known.ToArray();status=PackingStatus;}
        foreach(var id in commits)history.UnionWith(Parts(ReadMetadata<Commit>(ObjectPath(cache,"commits",id),"commit",id)));
        history.ExceptWith(current);
        long Size(string id){var local=ObjectPath(cache,"parts",id);var remote=ObjectPath(source,"parts",id);try{return File.Exists(local)?new FileInfo(local).Length:File.Exists(remote)?new FileInfo(remote).Length:0;}catch(IOException){return 0;}}
        var temporary=Directory.EnumerateFiles(Path.Combine(cache,"parts"),"*.tmp").Select(p=>new FileInfo(p)).ToArray();
        return new(status.TargetPartSizeBytes,status.PendingFiles,status.ActiveWriters,status.Running,status.LastError,current.Count,current.Sum(Size),history.Count,history.Sum(Size),temporary.Length,temporary.Sum(p=>p.Exists?p.Length:0),status.Paused);
    }
}
