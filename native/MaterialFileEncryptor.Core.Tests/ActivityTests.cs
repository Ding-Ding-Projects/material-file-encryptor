using MaterialFileEncryptor.Core;
using System.Security.Cryptography;
using System.Text;

internal static class ActivityTests
{
    public static void Run()
    {
        var root = Path.Combine(Path.GetTempPath(), "mfe-activity-" + Guid.NewGuid().ToString("N"));
        var options = new VaultOptions { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache") };
        using var credentials = VaultCredentials.KeyFile(RandomNumberGenerator.GetBytes(32));
        try
        {
            var entry = Guid.NewGuid().ToString("N");
            using (var engine = VaultEngine.Create(options, credentials))
            {
                Require(engine.ListActivity().Items.Count == 0, "Empty activity");
                engine.RecordActivity(entry, "import", "before.txt");
                engine.RecordActivity(entry, "rename", "after.txt");
                var first = engine.ListActivity(new(EntryId: entry, Limit: 1));
                Require(first.Items.Count == 1 && first.NextCursor != null, "First page");
                var next = engine.ListActivity(new(EntryId: entry, Cursor: first.NextCursor, Limit: 1));
                Require(next.Items.Count == 1 && next.Items[0].Id != first.Items[0].Id, "Stable page");
                Require(engine.ListActivity(new(EntryId: entry, Action: "rename", Pattern: "after")).Items.Count == 1, "Rename identity");
                var bytes = File.ReadAllBytes(Directory.GetFiles(Path.Combine(options.CacheRoot, "activity"))[0]);
                Require(!Encoding.UTF8.GetString(bytes).Contains("before.txt"), "Ciphertext only");
            }
            using (var reopened = VaultEngine.Open(options, credentials))
                Require(reopened.ListActivity(new(EntryId: entry)).Items.Count == 2, "Reopen persistence");
            var file = Directory.GetFiles(Path.Combine(options.CacheRoot, "activity"))[0];
            var corrupt = File.ReadAllBytes(file); corrupt[^1] ^= 1; File.WriteAllBytes(file, corrupt);
            using var tampered = VaultEngine.Open(options, credentials);
            try { tampered.ListActivity(); throw new Exception("Tampered activity was accepted."); }
            catch (CryptographicException) { }
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
}
