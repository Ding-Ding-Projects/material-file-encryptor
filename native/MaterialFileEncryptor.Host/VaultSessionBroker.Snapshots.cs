using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultSessionBroker
{
    private Task<object?> BeginSnapshot(Session session, JsonElement args)
    {
        if (session.Pending != 0 || session.SnapshotId is not null)
            throw new InvalidOperationException("Lock the vault and wait for synchronization to stop before preparing an image.");
        string? suppliedSource=String(args,"storageDir");
        session.Controller.ValidateSnapshotSource(suppliedSource);
        if(session.Controller.HasOpenSnapshotSource)
        {
            ++session.Pending;session.Transition=true;session.Preparing=true;session.SnapshotPreparing=true;
            return AcquireStagedSnapshotAsync(session);
        }
        if(!session.Controller.IsSessionReleased())throw new InvalidOperationException("The vault is still releasing native work.");
        string source = session.Controller.SnapshotSource(suppliedSource);
        ++session.Pending; session.Transition = true; session.Preparing = true; session.SnapshotPreparing = true;
        return AcquireSnapshotAsync(session, source);
    }
    private async Task<object?> AcquireStagedSnapshotAsync(Session session)
    {
        MaterialFileEncryptor.Core.VaultEngine.EncryptedSnapshot? staged=null;
        try
        {
            // Never execute encryption, hydration or staging under the broker lock.
            var result=await Task.Run(()=>session.Controller.StageSnapshotAsync()).ConfigureAwait(false);
            staged=result.Snapshot;
            lock(gate)
            {
                if(closing)throw new InvalidOperationException("Vault sessions are shutting down.");
                session.StagedSnapshot=staged;session.SnapshotId=Guid.NewGuid().ToString("N");staged=null;
                return new {leaseId=session.SnapshotId,storageDir=session.StagedSnapshot.StorageRoot,storageOnly=false,sourceMode=result.Mode};
            }
        }
        finally
        {
            try { staged?.Dispose(); }
            finally { lock(gate){--session.Pending;session.Transition=false;session.Preparing=false;session.SnapshotPreparing=false;Reconcile(session);} }
        }
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
                return new { leaseId = session.SnapshotId, storageDir = root, storageOnly = true, sourceMode = "locked-folder" };
            }
        }
        finally
        {
            lock (gate) { --session.Pending; session.Transition = false; session.Preparing = false; session.SnapshotPreparing = false; Reconcile(session); }
        }
    }
    private object ReleaseSnapshot(Session session, JsonElement args)
    {
        string supplied = String(args, "leaseId") ?? throw new ArgumentException("Snapshot lease identity is required.");
        if (session.SnapshotId != supplied) throw new InvalidOperationException("The snapshot lease no longer exists.");
        session.StagedSnapshot?.Dispose();session.StagedSnapshot=null;
        session.SnapshotId = null; Reconcile(session);
        return new { released = true };
    }
}
