using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultSessionBroker
{
    private Task<object?> BeginSnapshot(Session session)
    {
        if (session.Pending != 0 || session.SnapshotId is not null || !session.Controller.IsSessionReleased())
            throw new InvalidOperationException("Lock the vault and wait for synchronization to stop before preparing an image.");
        string source = session.Controller.SnapshotSource();
        ++session.Pending; session.Transition = true; session.Preparing = true;
        return AcquireSnapshotAsync(session, source);
    }
    private async Task<object?> AcquireSnapshotAsync(Session session, string source)
    {
        try
        {
            string root = await Task.Run(() => VaultSessionPaths.Canonical(source)).ConfigureAwait(false);
            lock (gate)
            {
                if (closing) throw new InvalidOperationException("Vault sessions are shutting down.");
                RejectMountedRoot(root);
                foreach (var other in sessions.Values.Where(other => other != session))
                    if (other.Roots.Any(owned => VaultSessionPaths.Overlap(root, owned)))
                        throw new InvalidOperationException("Another vault session owns this encrypted storage folder.");
                if (!session.Controller.IsSessionReleased()) throw new InvalidOperationException("The vault is still releasing native work.");
                session.Roots.Add(root);
                session.SnapshotId = Guid.NewGuid().ToString("N");
                return new { leaseId = session.SnapshotId, storageDir = source, storageOnly = true };
            }
        }
        finally
        {
            lock (gate) { --session.Pending; session.Transition = false; session.Preparing = false; Reconcile(session); }
        }
    }
    private object ReleaseSnapshot(Session session, JsonElement args)
    {
        string supplied = String(args, "leaseId") ?? throw new ArgumentException("Snapshot lease identity is required.");
        if (session.SnapshotId != supplied) throw new InvalidOperationException("The snapshot lease no longer exists.");
        session.SnapshotId = null; Reconcile(session);
        return new { released = true };
    }
}
