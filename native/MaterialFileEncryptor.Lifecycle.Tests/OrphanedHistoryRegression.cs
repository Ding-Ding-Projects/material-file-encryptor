using MaterialFileEncryptor.Host;

/// <summary>
/// A new drive created in a folder that once held a deleted drive must not inherit that drive's history:
/// the history folder is keyed by the storage path, and the old history made every synchronization fail
/// with an immutable ciphertext collision. The old history is renamed aside, never deleted.
/// </summary>
internal static class OrphanedHistoryRegression
{
    internal static void Run()
    {
        var root = Path.Combine(Path.GetTempPath(), "mfe-orphaned-history-" + Guid.NewGuid().ToString("N"));
        var history = Path.Combine(root, "History", "abc123");
        try
        {
            Assert(VaultController.SetAsideOrphanedHistory(history) is null, "A missing history folder is left alone");
            Directory.CreateDirectory(Path.Combine(history, "objects"));
            File.WriteAllText(Path.Combine(history, "objects", "kept.txt"), "old drive history");
            var aside = VaultController.SetAsideOrphanedHistory(history);
            Assert(aside is not null && !Directory.Exists(history), "The old history no longer sits where the new drive's history goes");
            Assert(File.ReadAllText(Path.Combine(aside!, "objects", "kept.txt")) == "old drive history", "The old history is kept, renamed aside");
            Assert(Path.GetDirectoryName(aside) == Path.GetDirectoryName(history) && Path.GetFileName(aside)!.StartsWith("abc123.orphaned-", StringComparison.Ordinal), "It stays next to the original with a clear name");
        }
        finally { try { Directory.Delete(root, true); } catch { } }
    }
    private static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
}
