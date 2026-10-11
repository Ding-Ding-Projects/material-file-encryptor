using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultController
{
    private readonly TransferOperationRegistry operations = new();
    private readonly SemaphoreSlim commandWorker = new(1, 1);
    private readonly object admissionGate = new();
    private int queuedCommands, activeCommands;
    private long admittedBytes;
    private const long MaximumQueuedBytes = 64L * 1024 * 1024 - 65536;
    private bool forceLocking;
    private object? cachedStatus;
    private long cachedFileRevision = -1;
    private List<object> cachedFiles = new();
    private long cachedHistoryRevision = -1;
    private int cachedVersionCount, cachedRecycledCount;

    // Only control methods bypass the single command consumer. Admission is
    // registered synchronously, before a force-lock can inspect pending work.
    public Task<object?> DispatchAsync(string method, JsonElement args)
    {
        if (method is "status" or "operations" or "cancelOperation" or "forceLock")
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
                    staged.Write(offset, buffer.AsSpan(0, count), cancellation); offset += count;
                    progress(completedBytes + offset, total, completedFiles, paths.Length);
                }
                cancellation.ThrowIfCancellationRequested();
                // No cancellation check follows atomic install: the file is now
                // completed even if a concurrent cancellation arrives.
                staged.Commit(cancellation);
                completedBytes += offset; ++completedFiles;
                progress(completedBytes, total, completedFiles, paths.Length);
            }
        }
        finally { System.Security.Cryptography.CryptographicOperations.ZeroMemory(buffer); }
    }
    private object ForceLock()
    {
        lock (admissionGate)
        {
            int transfers = operations.Outstanding;
            if (forceLocking || queuedCommands != 0 || activeCommands != 0 || transfers != 0)
                return new { locked = false, busy = true, code = "operations-active", activeOperations = activeCommands + transfers, queuedOperations = queuedCommands };
            if (!Monitor.TryEnter(gate)) return new { locked = false, busy = true, code = "crypto-active", activeOperations = 1, queuedOperations = 0 };
            try
            {
                if (activePreparedOperations != 0 || Volatile.Read(ref syncFlight) != 0 || (fileSystem?.ActiveIo ?? 0) != 0)
                    return new { locked = false, busy = true, code = "crypto-active", activeOperations = activePreparedOperations + (fileSystem?.ActiveIo ?? 0) + Volatile.Read(ref syncFlight), queuedOperations = 0 };
                if (fileSystem is not null && !fileSystem.BeginForceUnmount())
                    return new { locked = false, busy = true, code = "crypto-active", activeOperations = 1, queuedOperations = 0 };
                forceLocking = true;
            }
            finally { Monitor.Exit(gate); }
        }
        try
        {
            // Stopping the dispatcher may wait for callbacks and must never own
            // either admissionGate or the filesystem callback gate.
            FileSystemHostDetach();
            LockEngine();
            return new { locked = true, busy = false, code = "locked", activeOperations = 0, queuedOperations = 0 };
        }
        finally { lock (admissionGate) forceLocking = false; }
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
