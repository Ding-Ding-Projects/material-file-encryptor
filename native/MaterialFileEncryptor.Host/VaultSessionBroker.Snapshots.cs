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
            session.SnapshotCancellation=new CancellationTokenSource();
            return AcquireStagedSnapshotAsync(session,session.SnapshotCancellation.Token);
        }
        if(!session.Controller.IsSessionReleased())throw new InvalidOperationException("The vault is still releasing native work.");
        string source = session.Controller.SnapshotSource(suppliedSource);
        ++session.Pending; session.Transition = true; session.Preparing = true; session.SnapshotPreparing = true;
        session.SnapshotCancellation=new CancellationTokenSource();
        return AcquireSnapshotAsync(session, source,session.SnapshotCancellation.Token);
    }
    private Task<object?> CancelSnapshot(Session session)
    {
        if(!session.SnapshotPreparing || session.SnapshotCancellation is null)
            return Task.FromResult<object?>(new {cancellationRequested=false,preparing=false});
        // CancelAsync dispatches callbacks outside this broker lock. Ownership is
        // retained until the original preparation task and cleanup have settled.
        return CancelSnapshotAsync(session.SnapshotCancellation.CancelAsync());
    }
    private static async Task<object?> CancelSnapshotAsync(Task cancellation)
    {
        await cancellation.ConfigureAwait(false);
        return new {cancellationRequested=true,completionRequiresBeginSnapshot=true};
    }
    private void FinishSnapshotPreparation(Session session)
    {
        lock(gate)
        {
            session.SnapshotCancellation?.Dispose();session.SnapshotCancellation=null;
            --session.Pending;session.Transition=false;session.Preparing=false;session.SnapshotPreparing=false;Reconcile(session);
        }
    }
    private async Task<object?> AcquireStagedSnapshotAsync(Session session,CancellationToken cancellationToken)
    {
        MaterialFileEncryptor.Core.VaultEngine.EncryptedSnapshot? staged=null;
        try
        {
            // Never execute encryption, hydration or staging under the broker lock.
            var result=await Task.Run(()=>session.Controller.StageSnapshotAsync(cancellationToken)).ConfigureAwait(false);
            staged=result.Snapshot;
            lock(gate)
            {
                if(closing)throw new InvalidOperationException("Vault sessions are shutting down.");
                cancellationToken.ThrowIfCancellationRequested();
                session.StagedSnapshot=staged;session.SnapshotId=Guid.NewGuid().ToString("N");staged=null;
                return new {leaseId=session.SnapshotId,storageDir=session.StagedSnapshot.StorageRoot,storageOnly=false,sourceMode=result.Mode};
            }
        }
        finally
        {
            try { staged?.Dispose(); }
            finally { FinishSnapshotPreparation(session); }
        }
    }
    private async Task<object?> AcquireSnapshotAsync(Session session, string source,CancellationToken cancellationToken)
    {
        try
        {
            string root = await Task.Run(() => VaultSessionPaths.Canonical(source)).ConfigureAwait(false);
            lock (gate)
            {
                if (closing) throw new InvalidOperationException("Vault sessions are shutting down.");
                cancellationToken.ThrowIfCancellationRequested();
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
            FinishSnapshotPreparation(session);
        }
    }
    private object ReleaseSnapshot(Session session, JsonElement args)
    {
        if(session.SnapshotPreparing)throw new InvalidOperationException("Wait for snapshot preparation and cancellation cleanup to settle before releasing its lease.");
        string supplied = String(args, "leaseId") ?? throw new ArgumentException("Snapshot lease identity is required.");
        if (session.SnapshotId != supplied) throw new InvalidOperationException("The snapshot lease no longer exists.");
        session.StagedSnapshot?.Dispose();session.StagedSnapshot=null;
        session.SnapshotId = null; Reconcile(session);
        return new { released = true };
    }
}
