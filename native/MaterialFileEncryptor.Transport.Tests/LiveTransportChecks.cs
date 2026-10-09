using System.Security.Cryptography;
using MaterialFileEncryptor.Core;

static class LiveTransportChecks
{
    public static async Task RunAsync(string repository)
    {
        var root = Path.Combine(Path.GetTempPath(), "mfe-live-transport-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        Console.WriteLine("Fixture local storage: " + root);
        var checks = 0;
        void Check(bool value, string name) { if (!value) throw new InvalidOperationException(name); checks++; Console.WriteLine("PASS " + name); }
        byte[] EncryptedFixture()
        {
            var key = RandomNumberGenerator.GetBytes(32); var nonce = RandomNumberGenerator.GetBytes(12); var plain = RandomNumberGenerator.GetBytes(4096); var cipher = new byte[plain.Length]; var tag = new byte[16];
            try { using var aes = new AesGcm(key, 16); aes.Encrypt(nonce, plain, cipher, tag); return nonce.Concat(tag).Concat(cipher).ToArray(); }
            finally { CryptographicOperations.ZeroMemory(key); CryptographicOperations.ZeroMemory(plain); }
        }
        string Write(string source, string folder)
        {
            Directory.CreateDirectory(Path.Combine(source, folder)); var bytes = EncryptedFixture();
            var path = folder + "/" + Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant() + ".mfe";
            File.WriteAllBytes(Path.Combine(source, path), bytes); return path;
        }
        var runner = new VaultProcessRunner();
        var sourceA = Path.Combine(root, "source-a"); var sourceB = Path.Combine(root, "source-b");
        var a = new PrivateGitHubVaultTransport(sourceA, Path.Combine(root, "history-a"), repository, runner);
        await a.SyncAsync();
        var startingHistory = await a.History.ListSnapshotsAsync();
        Check(startingHistory.Count == 0 || File.Exists(Path.Combine(sourceA, "vault.json")), "private destination initializes with consistent metadata");
        Directory.CreateDirectory(sourceA); File.WriteAllText(Path.Combine(sourceA, "vault.json"), "{\"synthetic\":true}");
        var part = Write(sourceA, "parts"); var metadata = Write(sourceA, "commits");
        var initial = await a.History.RecordSnapshotAsync(["vault.json", part, metadata]); await a.SyncAsync();
        Check(initial != null, "initial encrypted snapshot published");
        var b = new PrivateGitHubVaultTransport(sourceB, Path.Combine(root, "history-b"), repository, runner);
        await b.SyncAsync();
        Check(File.Exists(Path.Combine(sourceB, metadata)) && !File.Exists(Path.Combine(sourceB, part)), "private clone hydrates metadata only");
        var missing = await runner.RunAsync("git", ["rev-list", "--objects", "--missing=print", "HEAD"], b.History.HistoryRoot);
        Check(missing.ExitCode == 0 && missing.Text.Split('\n').Any(x => x.StartsWith('?')), "real private server leaves promised payload missing");
        Check(b.ContainsFile(part), "private tree advertises lazy payload");
        await b.EnsureFileAsync(part);
        Check(File.ReadAllBytes(Path.Combine(sourceA, part)).SequenceEqual(File.ReadAllBytes(Path.Combine(sourceB, part))), "real private blob hydration preserves ciphertext");
        var snapshotA = Write(sourceA, "commits"); var snapshotB = Write(sourceB, "commits");
        await a.History.RecordSnapshotAsync([snapshotA]); await b.History.RecordSnapshotAsync([snapshotB]);
        await a.SyncAsync(); await b.SyncAsync(); await a.SyncAsync();
        Check(File.Exists(Path.Combine(sourceA, snapshotB)) && File.Exists(Path.Combine(sourceB, snapshotA)), "real private concurrent clients reconcile");
        var parents = await runner.RunAsync("git", ["rev-list", "--parents", "-1", "HEAD"], b.History.HistoryRoot);
        Check(parents.ExitCode == 0 && parents.Text.Trim().Split(' ').Length == 3, "private publication retains both snapshot parents");
        Check((await b.History.ReadEncryptedFileAsync(initial!, part)).SequenceEqual(File.ReadAllBytes(Path.Combine(sourceA, part))), "published initial snapshot remains readable");
        await b.SyncAsync();
        var proof = await runner.RunAsync("git", ["ls-remote", "origin", "refs/heads/main"], b.History.HistoryRoot);
        var head = await runner.RunAsync("git", ["rev-parse", "HEAD"], b.History.HistoryRoot);
        Check(proof.ExitCode == 0 && proof.Text.StartsWith(head.Text.Trim() + "\t", StringComparison.Ordinal), "real private main ref matches tested merge");
        Console.WriteLine($"Passed {checks} live private transport checks.");
        Console.WriteLine("Verified fixture head: " + head.Text.Trim());
        Console.WriteLine("Fixture retained for authorized review; no repository or local storage deleted.");
    }
}
