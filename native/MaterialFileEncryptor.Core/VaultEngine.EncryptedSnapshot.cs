using System.Security.AccessControl;
using System.Security.Principal;

namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    // Each snapshot owns its own set, so overlapping leases cannot unpin one another.
    private readonly Dictionary<string, HashSet<string>> encryptedSnapshotParts = [];
    internal Action? EncryptedSnapshotTestPoint { get; set; }

    public async Task<EncryptedSnapshot> StageEncryptedSnapshotAsync(CancellationToken cancellationToken = default)
    {
        using var lifetime = AcquireStorageOperation();
        string identity = Guid.NewGuid().ToString("N");
        var metadata = new Dictionary<string, string>(StringComparer.Ordinal);
        byte[] configuration;
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
            foreach (var relative in GetEncryptedActivitySnapshotPaths())
            {
                var path = Path.Combine(cache, relative);
                if (!File.Exists(path)) path = Path.Combine(source, relative);
                VaultCrypto.ValidatePhysicalPath(path);
                metadata.Add(relative, path);
            }
            parts = referenced.Order(StringComparer.Ordinal).ToArray();
            encryptedSnapshotParts.Add(identity, referenced);
        }
        string root = Path.Combine(Path.GetTempPath(), "mfe-encrypted-snapshot-" + identity);
        try
        {
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
                if (!File.Exists(local) && !File.Exists(remote) && HydrateEncryptedFileAsync is not null)
                    await HydrateEncryptedFileAsync("parts/" + part + ".mfe", cancellationToken).ConfigureAwait(false);
                string inputPath = File.Exists(local) ? local : remote;
                VaultCrypto.ValidatePhysicalPath(inputPath);
                VerifyPart(inputPath, part, cancellationToken:cancellationToken);
                using var input = File.OpenRead(inputPath);
                string target = ObjectPath(root, "parts", part);
                CopyAtomic(input, target, cancellationToken);
                VerifyPart(target, part, cancellationToken:cancellationToken);
            }
            cancellationToken.ThrowIfCancellationRequested();
            return new EncryptedSnapshot(root);
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
        internal EncryptedSnapshot(string storageRoot) { StorageRoot=storageRoot; }
        public string StorageRoot { get; }
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
