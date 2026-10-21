using MaterialFileEncryptor.Core;
using System.Reflection;
using System.Security.Cryptography;

internal static class ActivityCiphertextTests
{
    public static void Run()
    {
        CopiesAuthenticatedBytes();
        PreservesHistoricalRepresentations();
        RejectsConflictingAndTamperedRecords();
        RejectsSnapshotReplacement();
        PublishesCapturedBytesWithoutReplacement();
    }

    private static void CopiesAuthenticatedBytes()
    {
        WithVault((engine, options, item) =>
        {
            string local = ActivityPath(options.CacheRoot, item.Id), remote = ActivityPath(options.StorageRoot, item.Id);
            byte[] original = File.ReadAllBytes(local);
            engine.SynchronizeActivity();
            Require(File.ReadAllBytes(remote).SequenceEqual(original), "Activity synchronization re-encrypted a captured ciphertext object.");
            File.Delete(local);
            engine.SynchronizeActivity();
            Require(File.ReadAllBytes(local).SequenceEqual(original), "Reverse activity synchronization changed authenticated ciphertext.");
        });
    }

    private static void PreservesHistoricalRepresentations()
    {
        WithVault((engine, options, item) =>
        {
            string local = ActivityPath(options.CacheRoot, item.Id), remote = ActivityPath(options.StorageRoot, item.Id);
            byte[] cacheBytes = File.ReadAllBytes(local), sourceBytes = Encrypt(engine, options, item);
            Require(!cacheBytes.SequenceEqual(sourceBytes), "Historical fixture must contain distinct valid ciphertext.");
            Directory.CreateDirectory(Path.GetDirectoryName(remote)!); File.WriteAllBytes(remote, sourceBytes);
            engine.SynchronizeActivity();
            Require(File.ReadAllBytes(local).SequenceEqual(cacheBytes) && File.ReadAllBytes(remote).SequenceEqual(sourceBytes), "Equal historical activity was silently replaced.");
            using var snapshot = engine.StageEncryptedSnapshotAsync().GetAwaiter().GetResult();
            Require(File.ReadAllBytes(ActivityPath(snapshot.StorageRoot, item.Id)).SequenceEqual(sourceBytes), "Snapshot did not preserve the existing authenticated source representation.");
        });
    }

    private static void RejectsConflictingAndTamperedRecords()
    {
        WithVault((engine, options, item) =>
        {
            string remote = ActivityPath(options.StorageRoot, item.Id);
            Directory.CreateDirectory(Path.GetDirectoryName(remote)!);
            byte[] conflicting = Encrypt(engine, options, item with { Detail = "different authenticated content" });
            File.WriteAllBytes(remote, conflicting);
            Reject<InvalidDataException>(() => engine.SynchronizeActivity());
            Reject<InvalidDataException>(() => { using var snapshot = engine.StageEncryptedSnapshotAsync().GetAwaiter().GetResult(); });
            Require(File.ReadAllBytes(remote).SequenceEqual(conflicting), "Conflicting destination was overwritten.");
            byte[] corrupt = File.ReadAllBytes(ActivityPath(options.CacheRoot, item.Id)); corrupt[^1] ^= 1;
            File.WriteAllBytes(remote, corrupt);
            Reject<CryptographicException>(() => engine.SynchronizeActivity());
            Reject<CryptographicException>(() => { using var snapshot = engine.StageEncryptedSnapshotAsync().GetAwaiter().GetResult(); });
            Require(File.ReadAllBytes(remote).SequenceEqual(corrupt), "Tampered destination was overwritten.");
            File.Delete(remote);
        });
    }

    private static void RejectsSnapshotReplacement()
    {
        WithVault((engine, options, item) =>
        {
            string remote = ActivityPath(options.StorageRoot, item.Id);
            engine.SynchronizeActivity(); byte[] original = File.ReadAllBytes(remote);
            byte[] replacement = Encrypt(engine, options, item with { Detail = "changed after snapshot inventory" });
            engine.EncryptedSnapshotTestPoint = () => File.WriteAllBytes(remote, replacement);
            try
            {
                Reject<InvalidDataException>(() => { using var snapshot = engine.StageEncryptedSnapshotAsync().GetAwaiter().GetResult(); });
                Require(File.ReadAllBytes(remote).SequenceEqual(replacement), "Snapshot replaced the changed source.");
            }
            finally { engine.EncryptedSnapshotTestPoint = null; File.WriteAllBytes(remote, original); }
        });
    }

    private static void PublishesCapturedBytesWithoutReplacement()
    {
        WithVault((engine, options, item) =>
        {
            var read = typeof(VaultEngine).GetMethod("ReadAuthenticatedActivity", BindingFlags.Instance | BindingFlags.NonPublic)!;
            var publish = typeof(VaultEngine).GetMethod("PublishActivityCiphertext", BindingFlags.Instance | BindingFlags.NonPublic)!;
            string local = ActivityPath(options.CacheRoot, item.Id), remote = ActivityPath(options.StorageRoot, item.Id);
            var captured = ((VaultActivity Item, byte[] Ciphertext))read.Invoke(engine, new object[] { local, item.Id })!;
            byte[] replacement = Encrypt(engine, options, item with { Detail = "input changed after authentication" });
            File.WriteAllBytes(local, replacement);
            try
            {
                publish.Invoke(engine, new object[] { remote, captured.Item, captured.Ciphertext });
                Require(File.ReadAllBytes(remote).SequenceEqual(captured.Ciphertext), "Publication reopened the input after authentication.");
                byte[] historical = Encrypt(engine, options, item); File.WriteAllBytes(remote, historical);
                publish.Invoke(engine, new object[] { remote, captured.Item, captured.Ciphertext });
                Require(File.ReadAllBytes(remote).SequenceEqual(historical), "No-replace publication overwrote an existing equal record.");
                File.WriteAllBytes(remote, replacement);
                try { publish.Invoke(engine, new object[] { remote, captured.Item, captured.Ciphertext }); throw new Exception("Conflicting publication succeeded."); }
                catch (TargetInvocationException error) when (error.InnerException is InvalidDataException) { }
                Require(File.ReadAllBytes(remote).SequenceEqual(replacement), "No-replace publication overwrote conflicting ciphertext.");
            }
            finally { File.WriteAllBytes(local, captured.Ciphertext); if (File.Exists(remote)) File.Delete(remote); }
        });
    }

    private static byte[] Encrypt(VaultEngine engine, VaultOptions options, VaultActivity item)
    {
        byte[] master = engine.ExportMasterKey(), plain = VaultCrypto.Serialize(item);
        try
        {
            var config = VaultCrypto.Deserialize<Config>(File.ReadAllBytes(Path.Combine(options.StorageRoot, "vault.json")));
            return VaultCrypto.Seal(plain, master, $"mfe-v1/{config.VaultId}/activity/{item.Id}");
        }
        finally { CryptographicOperations.ZeroMemory(master); CryptographicOperations.ZeroMemory(plain); }
    }
    private static string ActivityPath(string root, string id) => Path.Combine(root, "activity", id + ".mfe");
    private static void WithVault(Action<VaultEngine, VaultOptions, VaultActivity> action)
    {
        string root = Path.Combine(Path.GetTempPath(), "mfe-activity-ciphertext-" + Guid.NewGuid().ToString("N"));
        var options = new VaultOptions { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache") };
        using var credential = VaultCredentials.KeyFile(RandomNumberGenerator.GetBytes(32));
        try
        {
            using var engine = VaultEngine.Create(options, credential);
            var item = engine.RecordActivity(Guid.NewGuid().ToString("N"), "create", "synthetic.txt");
            action(engine, options, item);
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
    private static void Reject<T>(Action action) where T : Exception
    {
        try { action(); } catch (T) { return; }
        throw new Exception("Invalid activity input was accepted.");
    }
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
}
