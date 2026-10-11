using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultController
{
    private readonly TransferOperationRegistry operations = new();
    private readonly SemaphoreSlim commandWorker = new(1, 1);
    private readonly object admissionGate = new();
    private int queuedCommands, activeCommands;
    private int performanceMode;
    private BackgroundPriorityScope BackgroundPriority()=>new(Volatile.Read(ref performanceMode)==0);
    private long admittedBytes;
    private const long MaximumQueuedBytes = 64L * 1024 * 1024 - 65536;
    private bool forceLocking;
    private object? cachedStatus;
    private object? cachedStatusSummary;
    private string? summarySignature;
    private object? cachedDriver;
    private object? cachedMountDiagnostic;
    private string[]? cachedDriveLetters;
    private string? cachedEnvironmentIdentity;
    private Fsp.FileSystemHost? cachedEnvironmentHost;
    private bool cachedAutoUnlock, refreshEnvironment=true;
    private long cachedFileRevision = -1;
    private List<object> cachedFiles = new();
    private long cachedHistoryRevision = -1;
    private int cachedVersionCount, cachedRecycledCount;

    // Only control methods bypass the single command consumer. Admission is
    // registered synchronously, before a force-lock can inspect pending work.
    public Task<object?> DispatchAsync(string method, JsonElement args)
    {
        if (method == "status") return Task.FromResult<object?>(Volatile.Read(ref cachedStatus) ?? new { busy = true });
        if (method == "statusSummary") return Task.FromResult<object?>(StatusSummary());
        if (method == "forceLock") return Task.Run(() => Execute(method,args));
        if (method is "operations" or "cancelOperation")
            return Task.FromResult(Execute(method, args));
        long requestBytes = args.ValueKind == JsonValueKind.Undefined ? 0 : System.Text.Encoding.UTF8.GetByteCount(args.GetRawText());
        lock (admissionGate)
        {
            if (forceLocking) throw new InvalidOperationException("The vault is locking. Retry after it is locked.");
            if (queuedCommands >= 64 || requestBytes > MaximumQueuedBytes - admittedBytes) throw new InvalidOperationException("The command queue is full.");
            ++queuedCommands; admittedBytes += requestBytes;
        }
        Task turn = commandWorker.WaitAsync();
        return Task.Run(async () =>
        {
            await turn;
            lock (admissionGate) { --queuedCommands; ++activeCommands; }
            try { return Execute(method, args); }
            finally { lock (admissionGate) { --activeCommands; admittedBytes -= requestBytes; } commandWorker.Release(); }
        });
    }
    public object StatusSummary()=>Volatile.Read(ref cachedStatusSummary)??new {busy=true};
    private void CacheSummary(object snapshot)
    {
        var summary=snapshot.GetType().GetProperties().Where(property=>property.Name!="files")
            .ToDictionary(property=>property.Name,property=>property.GetValue(snapshot));
        summary["fileCount"]=cachedFiles.Count;
        string signature=JsonSerializer.Serialize(summary);
        if(signature==summarySignature)return;
        summarySignature=signature;
        Volatile.Write(ref cachedStatusSummary,summary);
    }
    private object StartImport(JsonElement args)
    {
        string[] paths;
        lock (admissionGate)
        {
            if (forceLocking) throw new InvalidOperationException("The vault is locking.");
            if (!args.TryGetProperty("paths", out var values) || values.ValueKind != JsonValueKind.Array || values.GetArrayLength() is < 1 or > 1000)
                throw new ArgumentException("Select between one and 1000 files to import.");
            paths = values.EnumerateArray().Select(value => Path.GetFullPath(value.GetString() ?? throw new ArgumentException("Invalid import path."))).ToArray();
            lock (gate)
            {
                _ = Engine;
                foreach (string path in paths)
                    if (IsWithin(path, storageDir!) || IsWithin(path, cacheDir!)) throw new ArgumentException("Choose files outside the vault folders.");
            }
            return operations.Start(paths, ImportManagedAsync);
        }
    }
    private async Task ImportManagedAsync(string[] paths, CancellationToken cancellation, Action<long, long, int, int> progress)
    {
        using var bufferBudget=MaterialFileEncryptor.Core.TransferBufferBudget.Reserve(2L*65536,cancellation);
        // One 64 KiB plaintext buffer is owned by the single transfer consumer.
        // No plaintext is queued or written to temporary files.
        byte[] buffer = new byte[65536];
        long completedBytes = 0, total = paths.Sum(path => new FileInfo(path).Length);
        int completedFiles = 0;
        try
        {
            foreach (string path in paths)
            {
                cancellation.ThrowIfCancellationRequested();
                MaterialFileEncryptor.Core.VaultEngine captured;
                string candidate;
                lock (gate)
                {
                    captured = Engine;
                    string name = MaterialFileEncryptor.Core.VaultPath.Normalize(Path.GetFileName(path));
                    candidate = name;
                    for (int suffix = 2; captured.GetInfo(candidate) is not null; ++suffix)
                        candidate = Path.GetFileNameWithoutExtension(name) + " (" + suffix + ")" + Path.GetExtension(name);
                }
                using var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.Asynchronous | FileOptions.SequentialScan);
                using var staged = captured.BeginImport(candidate);
                long offset = 0;
                int count;
                while ((count = await input.ReadAsync(buffer, cancellation)) != 0)
                {
                    cancellation.ThrowIfCancellationRequested();
                    using(BackgroundPriority())staged.Write(offset, buffer.AsSpan(0, count), cancellation);
                    offset += count;
                    progress(completedBytes + offset, total, completedFiles, paths.Length);
                }
                cancellation.ThrowIfCancellationRequested();
                // No cancellation check follows atomic install: the file is now
                // completed even if a concurrent cancellation arrives.
                using(BackgroundPriority())staged.Commit(cancellation);
                completedBytes += offset; ++completedFiles;
                progress(completedBytes, total, completedFiles, paths.Length);
                var installed = captured.GetInfo(candidate)!;
                using(BackgroundPriority())captured.RecordActivity(installed.EntryId, "import", candidate);
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
            using var priority=BackgroundPriority();
            lock (gate) { if (vault is not null) vault.RecordActivity(vault.VaultId, "cancel", detail: "Managed import cancelled"); }
            throw;
        }
        finally { System.Security.Cryptography.CryptographicOperations.ZeroMemory(buffer); }
    }
    private object StartExport(JsonElement args)
    {
        bool version=args.TryGetProperty("versionId",out _), current=args.TryGetProperty("path",out _);
        if(version==current)throw new ArgumentException("Select exactly one current path or versionId to export.");
        _=RequiredString(args,version?"versionId":"path");
        JsonElement capturedArgs=args.Clone();
        lock(admissionGate)
        {
            if(forceLocking)throw new InvalidOperationException("The vault is locking.");
            return operations.Start([RequiredString(args,"destination")],(_,cancellation,progress)=>Task.Run(()=>
            { if(current)ExportCurrentFile(capturedArgs,cancellation,progress);else {ExportVersionFile(capturedArgs,cancellation);progress(0,0,1,1);} },cancellation));
        }
    }
    private object ExportCurrentFile(JsonElement args,CancellationToken cancellation,Action<long,long,int,int> progress)
    {
        using var priority=BackgroundPriority();
        using var bufferBudget=MaterialFileEncryptor.Core.TransferBufferBudget.Reserve(2L*65536,cancellation);
        string path=RequiredString(args,"path"),destination=Path.GetFullPath(RequiredString(args,"destination"));
        MaterialFileEncryptor.Core.VaultEngine captured;
        MaterialFileEncryptor.Core.VaultEngine.ReadSnapshot snapshot;
        lock(gate)
        {
            captured=Engine;
            if(IsWithin(destination,storageDir!)||IsWithin(destination,cacheDir!))throw new ArgumentException("Export outside encrypted storage and cache folders.");
            snapshot=captured.AcquireReadSnapshot(path);++activePreparedOperations;
        }
        string temporary=destination+"."+Guid.NewGuid().ToString("N")+".tmp";
        byte[] buffer=new byte[65536];
        try
        {
            using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,FileOptions.WriteThrough))
            {
                progress(0,snapshot.Length,0,1);
                for(long offset=0;offset<snapshot.Length;)
                {
                    cancellation.ThrowIfCancellationRequested();
                    int length=(int)Math.Min(buffer.Length,snapshot.Length-offset);
                    snapshot.PrepareRangeAsync(offset,length,cancellation).GetAwaiter().GetResult();
                    cancellation.ThrowIfCancellationRequested();
                    int count=snapshot.ReadRange(offset,buffer.AsSpan(0,length),cancellation);
                    if(count==0)throw new EndOfStreamException("Snapshot ended before its recorded length.");
                    stream.Write(buffer,0,count);offset+=count;progress(offset,snapshot.Length,0,1);
                }
                stream.Flush(true);
            }
            cancellation.ThrowIfCancellationRequested();
            File.Move(temporary,destination,true);
            // Installation wins a late cancellation. Audit failure cannot undo it.
            try{captured.RecordActivity(snapshot.EntryId,"export",path);}catch{ }
            progress(snapshot.Length,snapshot.Length,1,1);
            return new {exported=true};
        }
        catch(OperationCanceledException) when(cancellation.IsCancellationRequested)
        {try{captured.RecordActivity(snapshot.EntryId,"cancel",path,detail:"Managed export cancelled");}catch{ }throw;}
        finally
        {
            System.Security.Cryptography.CryptographicOperations.ZeroMemory(buffer);
            snapshot.Dispose();
            try{if(File.Exists(temporary))File.Delete(temporary);}
            finally{lock(gate)--activePreparedOperations;}
        }
    }
    private object ExportVersionFile(JsonElement args,CancellationToken cancellation=default)
    {
        using var priority=BackgroundPriority();
        using var bufferBudget=MaterialFileEncryptor.Core.TransferBufferBudget.Reserve(2L*65536,cancellation);
        string versionId=RequiredString(args,"versionId"), destination=Path.GetFullPath(RequiredString(args,"destination"));
        MaterialFileEncryptor.Core.VaultEngine captured;
        lock(gate)
        {
            captured=Engine;
            if(IsWithin(destination,storageDir!)||IsWithin(destination,cacheDir!))throw new ArgumentException("Export outside encrypted storage and cache folders.");
            ++activePreparedOperations;
        }
        string temporary=destination+"."+Guid.NewGuid().ToString("N")+".tmp";
        try
        {
            captured.PrepareVersionsAsync([versionId],cancellationToken:cancellation).GetAwaiter().GetResult();
            using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,FileOptions.WriteThrough))
            { captured.ExportVersion(versionId,stream,cancellation);stream.Flush(true); }
            cancellation.ThrowIfCancellationRequested();
            File.Move(temporary,destination,true);
            var selected=captured.ListVersions().Single(version=>version.Id==versionId);
            try{captured.RecordActivity(selected.EntryId,"export",selected.Path,versionId);}catch{ }
            return new { exported=true };
        }
        catch(OperationCanceledException) when(cancellation.IsCancellationRequested)
        {try{captured.RecordActivity(captured.VaultId,"cancel",versionId:versionId,detail:"Managed version export cancelled");}catch{ }throw;}
        finally
        {
            try { if(File.Exists(temporary))File.Delete(temporary); }
            finally { lock(gate)--activePreparedOperations; }
        }
    }
    private static object ActivityPage(MaterialFileEncryptor.Core.VaultActivityPage page) => new
    {
        items = page.Items.Select(item => new { id=item.Id,entryId=item.EntryId,action=item.Action,timestampUtc=item.TimestampUtc,path=item.Path,versionId=item.VersionId,detail=item.Detail }).ToArray(),
        nextCursor = page.NextCursor
    };
    private static object PreviewInfo(MaterialFileEncryptor.Core.VaultVersionPreview value) => new { versionId=value.VersionId,text=value.Text,length=value.Length };
    private object? JournalInfo()
    {
        if(vault is null)return null;
        var value=vault.JournalStatistics;
        return new { appendedBytes=value.AppendedBytes,appendedFrames=value.AppendedFrames,checkpointBytes=value.CheckpointBytes,checkpoints=value.Checkpoints,pendingFrames=value.PendingFrames };
    }
    private object ForceLockResult(bool locked, bool busy, string code, int activeOperations, int queuedOperations) => new
    {
        locked, busy, code, activeOperations, queuedOperations,
        activeFilesystemIo = fileSystem?.ActiveIoSnapshot ?? 0,
        activePreparedOperations = Volatile.Read(ref activePreparedOperations),
        activeSynchronization = Volatile.Read(ref syncFlight)
    };
    internal bool TryBeginBackgroundWork()
    {
        lock(admissionGate)
        {
            if(forceLocking||syncFlight!=0)return false;
            Volatile.Write(ref syncFlight,1);return true;
        }
    }
    internal void EndBackgroundWork(){lock(admissionGate)Volatile.Write(ref syncFlight,0);}
    internal void EndForceLock(){lock(admissionGate)forceLocking=false;}
    internal object? TryReserveForceLock()
    {
        lock (admissionGate)
        {
            int transfers = operations.Outstanding;
            if (forceLocking || queuedCommands != 0 || activeCommands != 0 || transfers != 0)
                return ForceLockResult(false, true, "operations-active", activeCommands + transfers, queuedCommands);
            if (!Monitor.TryEnter(gate)) return ForceLockResult(false, true, "crypto-active", 1, 0);
            try
            {
                if (activePreparedOperations != 0 || Volatile.Read(ref syncFlight) != 0 || (fileSystem?.ActiveIo ?? 0) != 0)
                    return ForceLockResult(false, true, "crypto-active", activePreparedOperations + (fileSystem?.ActiveIo ?? 0) + Volatile.Read(ref syncFlight), 0);
                if (fileSystem is not null && !fileSystem.BeginForceUnmount())
                    return ForceLockResult(false, true, "crypto-active", 1, 0);
                forceLocking = true;
            }
            finally { Monitor.Exit(gate); }
        }
        return null;
    }
    private object ForceLock()
    {
        object? busy=TryReserveForceLock();if(busy is not null)return busy;
        try
        {
            // Stopping the dispatcher may wait for callbacks and must never own
            // either admissionGate or the filesystem callback gate.
            FileSystemHostDetach();
            LockEngine();
            Status();
            return ForceLockResult(true, false, "locked", 0, 0);
        }
        finally { EndForceLock(); }
    }
    private void FileSystemHostDetach()
    {
        Fsp.FileSystemHost? captured;
        lock (gate) captured = host;
        try { captured?.Unmount(); }
        catch { lock (gate) fileSystem?.CancelUnmount(); throw; }
        lock (gate) { host = null; fileSystem = null; registeredDriveLetter = null; unmountBusy = false; }
    }
    private object ListFiles(JsonElement args)
    {
        lock (gate)
        {
            long revision = Engine.Revision;
            int offset = checked((int)(OptionalLong(args, "cursor") ?? 0));
            int limit = checked((int)(OptionalLong(args, "limit") ?? 200));
            if (offset < 0 || limit is < 1 or > 1000) throw new ArgumentException("Invalid page.");
            long? expected = OptionalLong(args, "revision");
            RefreshFiles();
            bool reset = expected.HasValue && expected != revision;
            if (reset) offset = 0;
            var items = cachedFiles.Skip(offset).Take(limit).ToArray();
            int next = offset + items.Length;
            return new { revision, items, nextCursor = next < cachedFiles.Count ? (int?)next : null, resetRequired = reset };
        }
    }
    private void RefreshFiles()
    {
        long revision = vault?.Revision ?? -1;
        if (revision == cachedFileRevision) return;
        cachedFiles = new();
        if (vault is not null) CollectFiles("", cachedFiles);
        cachedFileRevision = revision;
    }
}
