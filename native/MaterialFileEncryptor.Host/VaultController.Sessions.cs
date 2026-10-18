namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultController
{
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
