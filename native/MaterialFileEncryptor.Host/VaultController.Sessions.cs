namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultController
{
    internal bool HasOpenSnapshotSource { get { lock(gate) return vault is not null; } }
    internal async Task<(MaterialFileEncryptor.Core.VaultEngine.EncryptedSnapshot Snapshot, string Mode)> StageSnapshotAsync()
    {
        MaterialFileEncryptor.Core.VaultEngine captured;
        string mode;
        lock(gate) { captured=Engine;mode=host is null?"unlocked-staged":"mounted-staged";++activePreparedOperations; }
        try { return (await captured.StageEncryptedSnapshotAsync().ConfigureAwait(false),mode); }
        finally { lock(gate)--activePreparedOperations; }
    }
    internal void ValidateSnapshotSource(string? suppliedSource)
    {
        lock(gate)
        {
            if(suppliedSource is null)return;
            if(string.IsNullOrWhiteSpace(suppliedSource))throw new ArgumentException("Select encrypted storage.");
            string supplied=Path.TrimEndingDirectorySeparator(Path.GetFullPath(suppliedSource));
            if(storageDir is not null && !supplied.Equals(Path.TrimEndingDirectorySeparator(Path.GetFullPath(storageDir)),OperatingSystem.IsWindows()?StringComparison.OrdinalIgnoreCase:StringComparison.Ordinal))
                throw new InvalidOperationException("The selected source does not match this vault session.");
        }
    }
    internal string SnapshotSource(string? suppliedSource = null)
    {
        lock (gate)
        {
            ValidateSnapshotSource(suppliedSource);
            if (vault is not null || host is not null || storageDir is null && suppliedSource is null)
                throw new InvalidOperationException("Open and safely lock a vault before preparing its encrypted folder image.");
            if (transportMode != "folder")
                throw new InvalidOperationException("Image export requires complete folder storage. Private repository storage may be sparse.");
            return storageDir ?? Path.GetFullPath(suppliedSource!);
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
