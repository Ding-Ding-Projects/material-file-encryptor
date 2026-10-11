using System.Text.Json;

namespace MaterialFileEncryptor.Host;

// The control reader never waits for this queue. It carries paths and bounded
// request metadata, not file bodies, and one consumer performs crypto work.
internal sealed class TransferOperationRegistry
{
    private sealed class Operation(string id)
    {
        public readonly string Id = id;
        public readonly CancellationTokenSource Cancellation = new();
        public string State = "queued";
        public long Bytes, TotalBytes;
        public int CompletedFiles, TotalFiles;
        public string? Error;
        public string? ErrorCode;
        public string? ErrorPhase;
    }
    private readonly object gate = new();
    private readonly Dictionary<string, Operation> entries = new();
    private readonly Queue<string> order = new();
    private readonly SemaphoreSlim worker = new(1, 1);
    private int outstanding;
    public int Outstanding { get { lock (gate) return outstanding; } }
    public object Start(string[] paths, Func<string[], CancellationToken, Action<long, long, int, int>, Task> run)
    {
        Operation item;
        lock (gate)
        {
            if (outstanding >= 64) throw new InvalidOperationException("The transfer queue is full. Wait for an operation to finish.");
            while (entries.Count >= 128 && order.Count > 0)
            {
                string? old = order.FirstOrDefault(id => entries[id].State is not ("queued" or "running" or "cancelling"));
                if (old is null) throw new InvalidOperationException("The transfer history is full.");
                int count = order.Count;
                for (int index = 0; index < count; ++index) { string retained = order.Dequeue(); if (retained != old) order.Enqueue(retained); }
                entries[old].Cancellation.Dispose(); entries.Remove(old);
            }
            item = new Operation(Guid.NewGuid().ToString("N")) { TotalFiles = paths.Length };
            entries.Add(item.Id, item); order.Enqueue(item.Id); ++outstanding;
        }
        Task turn = worker.WaitAsync(item.Cancellation.Token);
        _ = Task.Run(async () =>
        {
            bool entered = false;
            try
            {
                await turn; entered = true;
                lock (gate) item.State = "running";
                await run(paths, item.Cancellation.Token, (bytes, total, complete, count) =>
                {
                    lock (gate) { item.Bytes = bytes; item.TotalBytes = total; item.CompletedFiles = complete; item.TotalFiles = count; }
                });
                // Commit wins the cancellation race. A late request never relabels
                // already installed output as discarded.
                lock (gate) item.State = "completed";
            }
            catch (OperationCanceledException) when (item.Cancellation.IsCancellationRequested)
            { lock (gate) item.State = "cancelled"; }
            catch (Exception error)
            { lock (gate) { item.State = "failed"; item.ErrorCode = ClassifyFailure(error); item.ErrorPhase = TransferPhaseException.GetSafePhase(error); item.Error = "Transfer could not finish. Completed files remain available; retry the remaining files."; } }
            finally { if (entered) worker.Release(); lock (gate) --outstanding; }
        });
        return new { operationId = item.Id };
    }
    public object Cancel(string id)
    {
        lock (gate)
        {
            if (!entries.TryGetValue(id, out var item)) throw new ArgumentException("Unknown operation.");
            bool accepted = item.State is "queued" or "running" or "cancelling";
            if (accepted) { item.State = "cancelling"; item.Cancellation.Cancel(); }
            return new { operationId = id, accepted, state = item.State };
        }
    }
    public object Snapshot()
    {
        lock (gate) return order.Select(id => entries[id]).Select(item => new
        { operationId = item.Id, state = item.State, bytesCompleted = item.Bytes, totalBytes = item.TotalBytes,
          completedFiles = item.CompletedFiles, totalFiles = item.TotalFiles, error = item.Error, errorCode = item.ErrorCode, errorPhase = item.ErrorPhase }).ToArray();
    }
    internal static string ClassifyFailure(Exception error) => error.GetBaseException() switch
    {
        FileNotFoundException => "SOURCE_FILE_MISSING",
        DirectoryNotFoundException => "DIRECTORY_MISSING",
        UnauthorizedAccessException => "ACCESS_DENIED",
        System.Security.Cryptography.CryptographicException => "AUTHENTICATION_FAILED",
        IOException io when (io.HResult & 0xffff) is 0x70 or 0x27 => "STORAGE_FULL",
        IOException => "STORAGE_IO_FAILED",
        ObjectDisposedException => "RESOURCE_CLOSED",
        InvalidOperationException => "INVALID_OPERATION",
        ArgumentException => "INVALID_REQUEST",
        OverflowException => "NUMERIC_OVERFLOW",
        _ => "TRANSFER_FAILED"
    };
}
