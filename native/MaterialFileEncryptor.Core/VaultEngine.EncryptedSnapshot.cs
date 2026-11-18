using System.Security.AccessControl;
using System.Security.Principal;

namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    // Each snapshot owns its own set, so overlapping leases cannot unpin one another.
    private readonly Dictionary<string, HashSet<string>> encryptedSnapshotParts = [];
    internal Action? EncryptedSnapshotTestPoint { get; set; }

    public Task<EncryptedSnapshot> StageEncryptedSnapshotAsync(CancellationToken cancellationToken = default) => StageEncryptedSnapshotAsync(null, false, cancellationToken);
    public Task<EncryptedSnapshot> StageEncryptedSnapshotAsync(Action<int,int,long,long>? progress, CancellationToken cancellationToken = default) => StageEncryptedSnapshotAsync(progress, false, cancellationToken);

    /// <summary>Reports copied parts and bytes as (partsDone, partsTotal, bytesDone, bytesTotal). Totals cover parts already present locally; a part hydrated during staging adds its size when copied.</summary>
    /// <param name="leaveSourceParts">Parts already in the storage folder are listed in <see cref="EncryptedSnapshot.SourceParts"/> instead of
    /// being copied. The storage folder never deletes a part, so a caller can read them in place; only parts that exist
    /// solely in the local cache are staged. This keeps temporary disk use to the data that is not yet in storage.</param>
    public async Task<EncryptedSnapshot> StageEncryptedSnapshotAsync(Action<int,int,long,long>? progress, bool leaveSourceParts, CancellationToken cancellationToken = default)
    {
        using var lifetime = AcquireStorageOperation();
        string identity = Guid.NewGuid().ToString("N");
        var metadata = new Dictionary<string, string>(StringComparer.Ordinal);
        byte[] configuration;
        VaultActivity[] activities;
        string[] parts;
        lock (gate)
        {
            Check(); cancellationToken.ThrowIfCancellationRequested(); FlushLocal();
            // Freeze the complete immutable history, including the transaction just
            // created from the journal. Do not re-enumerate after releasing the lock.
            var selected = known.ToHashSet(StringComparer.Ordinal);
            var referenced = new HashSet<string>(StringComparer.Ordinal);
            foreach (var id in selected)
            {
                var path = ObjectPath(cache, "commits", id);
                var commit = ReadMetadata<Commit>(path, "commit", id);
                if (commit.Parents.Any(parent => !selected.Contains(parent)))
                    throw new InvalidDataException("Snapshot transaction history is incomplete.");
                referenced.UnionWith(Parts(commit));
                metadata.Add("commits/" + id + ".mfe", path);
            }
            configuration = VaultCrypto.Serialize(config);
            // Validate both representations and freeze logical identities under the
            // namespace lock. Ciphertext is read one bounded object at a time below.
            activities = ReadAllActivityObjects();
            parts = referenced.Order(StringComparer.Ordinal).ToArray();
            encryptedSnapshotParts.Add(identity, referenced);
        }
        string root = Path.Combine(Path.GetTempPath(), "mfe-encrypted-snapshot-" + identity);
        try
        {
            long bytesTotal=0,bytesDone=0;int partsDone=0;
            var inSource=new List<string>();
            if(leaveSourceParts)
            {
                VaultCrypto.ValidatePhysicalPath(Path.Combine(source,"parts"));
                foreach(var part in parts){cancellationToken.ThrowIfCancellationRequested();if(File.Exists(ObjectPath(source,"parts",part)))inSource.Add(part);}
                var resident=inSource.ToHashSet(StringComparer.Ordinal);parts=parts.Where(part=>!resident.Contains(part)).ToArray();
            }
            foreach (var part in parts)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var local=new FileInfo(ObjectPath(cache,"parts",part));var remote=new FileInfo(ObjectPath(source,"parts",part));
                bytesTotal+=local.Exists?local.Length:remote.Exists?remote.Length:0;
            }
            progress?.Invoke(0,parts.Length,0,bytesTotal);
            EncryptedSnapshotTestPoint?.Invoke();
            // All source hydration and large ciphertext copies run outside gate.
            Directory.CreateDirectory(root);
            if (OperatingSystem.IsWindows())
            {
                using var user=WindowsIdentity.GetCurrent();
                var security=new DirectorySecurity();security.SetAccessRuleProtection(true,false);
                security.AddAccessRule(new FileSystemAccessRule(user.User ?? throw new IOException("Current user identity is unavailable."),FileSystemRights.FullControl,InheritanceFlags.ContainerInherit|InheritanceFlags.ObjectInherit,PropagationFlags.None,AccessControlType.Allow));
                new DirectoryInfo(root).SetAccessControl(security);
            }
            else File.SetUnixFileMode(root, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
            VaultCrypto.AtomicWrite(Path.Combine(root,"vault.json"),configuration);
            foreach (var item in activities)
            {
                cancellationToken.ThrowIfCancellationRequested();
                // Older versions re-encrypted activity when copying between roots.
                // Keep an existing authenticated source representation stable so an
                // exported snapshot can merge back without replacing immutable data.
                string inputPath = ObjectPath(source, "activity", item.Id);
                if (!File.Exists(inputPath)) inputPath = ObjectPath(cache, "activity", item.Id);
                var authenticated = ReadAuthenticatedActivity(inputPath, item.Id);
                if (authenticated.Item != item) throw new InvalidDataException("Conflicting activity object.");
                PublishActivityCiphertext(ObjectPath(root, "activity", item.Id), item, authenticated.Ciphertext);
            }
            foreach (var item in metadata)
            {
                cancellationToken.ThrowIfCancellationRequested();
                VaultCrypto.ValidatePhysicalPath(item.Value);
                using var input=File.OpenRead(item.Value);
                CopyAtomic(input,Path.Combine(root,item.Key),cancellationToken);
            }
            foreach (var part in parts)
            {
                cancellationToken.ThrowIfCancellationRequested();
                string local = ObjectPath(cache, "parts", part);
                string remote = ObjectPath(source, "parts", part);
                if (!File.Exists(local) && !File.Exists(remote) && CanHydrate)
                    await HydratePartAsync("parts/" + part + ".mfe", cancellationToken).ConfigureAwait(false);
                string inputPath = File.Exists(local) ? local : remote;
                VaultCrypto.ValidatePhysicalPath(inputPath);
                VerifyPart(inputPath, part, cancellationToken:cancellationToken);
                using var input = File.OpenRead(inputPath);
                string target = ObjectPath(root, "parts", part);
                CopyAtomic(input, target, cancellationToken);
                VerifyPart(target, part, cancellationToken:cancellationToken);
                long copied=new FileInfo(target).Length;bytesDone+=copied;if(bytesDone>bytesTotal)bytesTotal=bytesDone;
                progress?.Invoke(++partsDone,parts.Length,bytesDone,bytesTotal);
            }
            cancellationToken.ThrowIfCancellationRequested();
            return new EncryptedSnapshot(root, leaveSourceParts ? source : null, inSource.Select(part => "parts/" + part + ".mfe").ToArray());
        }
        catch
        {
            if (Directory.Exists(root)) Directory.Delete(root, true);
            throw;
        }
        finally { lock (gate) encryptedSnapshotParts.Remove(identity); }
    }

    public sealed class EncryptedSnapshot : IDisposable
    {
        private readonly object cleanupGate = new();
        private bool closed;
        internal EncryptedSnapshot(string storageRoot, string? sourceRoot = null, IReadOnlyList<string>? sourceParts = null) { StorageRoot=storageRoot; SourceRoot=sourceRoot; SourceParts=sourceParts ?? Array.Empty<string>(); }
        public string StorageRoot { get; }
        /// <summary>The storage folder holding <see cref="SourceParts"/>, or null when every part was staged.</summary>
        public string? SourceRoot { get; }
        public IReadOnlyList<string> SourceParts { get; }
        public void Dispose()
        {
            lock (cleanupGate)
            {
                if (closed) return;
                VaultCrypto.ValidatePhysicalPath(StorageRoot);
                if (Directory.Exists(StorageRoot)) Directory.Delete(StorageRoot, true);
                closed = true;
            }
        }
    }
}
