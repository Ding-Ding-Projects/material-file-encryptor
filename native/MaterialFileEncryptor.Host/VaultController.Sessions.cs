namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultController
{
    internal string SnapshotSource()
    {
        lock (gate)
        {
            if (vault is not null || host is not null || storageDir is null)
                throw new InvalidOperationException("Open and safely lock a vault before preparing its encrypted folder image.");
            if (transportMode != "folder")
                throw new InvalidOperationException("Image export requires complete folder storage. Private repository storage may be sparse.");
            return storageDir;
        }
    }
    // Never use cached UI status to release ownership: it may describe the state
    // before a queued command, open, mount or background synchronization.
    internal bool IsSessionReleased()
    {
        if (!Monitor.TryEnter(admissionGate)) return false;
        try
        {
            if (queuedCommands != 0 || activeCommands != 0 || ForceBusy || operations.Outstanding != 0) return false;
            if (!Monitor.TryEnter(gate)) return false;
            try { return vault is null && host is null && activePreparedOperations == 0 && Volatile.Read(ref syncFlight) == 0; }
            finally { Monitor.Exit(gate); }
        }
        finally { Monitor.Exit(admissionGate); }
    }
}
