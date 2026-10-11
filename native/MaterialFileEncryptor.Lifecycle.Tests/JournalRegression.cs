using System.Diagnostics;
using System.Text.Json;
using System.Security.Cryptography;
using MaterialFileEncryptor.Core;

internal static class JournalRegression
{
    static VaultOptions Options(string root) => new() { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache"), PartSizeBytes = 1048576 };
    static VaultCredentials Credentials() => VaultCredentials.Password("journal fixture only");
    static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    internal static void Child(string root)
    {
        using var credential = Credentials();
        var engine = VaultEngine.Open(Options(root), credential);
        engine.CreateDirectory("folder"); engine.CreateFile("folder/original");
        byte[] block = new byte[65536];
        for (int index = 0; index < 64; ++index) { Array.Fill(block, (byte)index); engine.WriteRange("folder/original", index * 65536L, block); engine.FlushLocalOnly(); }
        engine.Rename("folder/original", "folder/renamed"); engine.FlushLocalOnly();
        engine.SetLength("folder/renamed", 65537); engine.SetLength("folder/renamed", 131072); engine.FlushLocalOnly();
        engine.WriteRange("folder/renamed", 100000, new byte[] { 77 }); engine.FlushLocalOnly();
        engine.CreateFile("removed"); engine.FlushLocalOnly(); engine.Delete("removed"); engine.FlushLocalOnly();
        Console.WriteLine(JsonSerializer.Serialize(engine.JournalStatistics));
        // Deliberately bypass disposal to model termination after acknowledged writes.
        Environment.Exit(0);
    }
    internal static void Run()
    {
        string root = Path.Combine(Path.GetTempPath(), "mfe-journal-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            using (var credential = Credentials()) using (var created = VaultEngine.Create(Options(root), credential)) { }
            var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            if (Path.GetFileNameWithoutExtension(Environment.ProcessPath) == "dotnet") start.ArgumentList.Add(typeof(JournalRegression).Assembly.Location);
            start.ArgumentList.Add("--journal-child"); start.ArgumentList.Add(root);
            using var process = Process.Start(start)!;
            string output = process.StandardOutput.ReadToEnd(), errors = process.StandardError.ReadToEnd();
            Assert(process.WaitForExit(30000) && process.ExitCode == 0, "Journal child failed: " + errors);
            var statistics = JsonDocument.Parse(output.Trim()).RootElement;
            Console.WriteLine($"Journal bytes={statistics.GetProperty("AppendedBytes").GetInt64()} frames={statistics.GetProperty("AppendedFrames").GetInt64()} for 4 MiB sequential writes");
            Assert(statistics.GetProperty("AppendedFrames").GetInt64() >= 64, "Writes were not individually journaled");
            Assert(statistics.GetProperty("AppendedBytes").GetInt64() < 64 * 4096, "Journal amplification grew with total file size");
            string log = Path.Combine(root, "cache", "journal.log.mfe");
            byte[] originalLog = File.ReadAllBytes(log), originalCheckpoint = File.ReadAllBytes(Path.Combine(root, "cache", "journal.mfe"));
            using (var credential = Credentials()) using (var reopened = VaultEngine.Open(Options(root), credential))
            {
                Assert(reopened.GetInfo("folder/original") is null && reopened.GetInfo("removed") is null, "Mutation replay lost rename/delete");
                Assert(reopened.GetInfo("folder/renamed")?.Length == 131072, "Mutation replay lost length");
                byte[] data = new byte[131072]; reopened.ReadRange("folder/renamed", 0, data);
                Assert(data.Take(65536).All(value => value == 0) && data[65536] == 1 && data[100000] == 77, "Mutation replay changed bytes");
                Assert(data.Skip(65537).Where((_, index) => index + 65537 != 100000).All(value => value == 0), "Truncated bytes resurrected");
            }
            // A crash after checkpoint replacement but before old-log retirement
            // leaves a valid prefix that must not replay twice.
            File.WriteAllBytes(log,originalLog);
            using(var credential=Credentials()) using(var checkpointed=VaultEngine.Open(Options(root),credential))
                Assert(checkpointed.GetInfo("folder/renamed")?.Length==131072,"Old log prefix replayed after checkpoint");
            // Restore the exact pre-compaction snapshot and damage a complete frame.
            File.WriteAllBytes(Path.Combine(root, "cache", "journal.mfe"), originalCheckpoint);
            byte[] damaged = originalLog.ToArray(); damaged[48] ^= 1; File.WriteAllBytes(log, damaged);
            bool rejected = false;
            try { using var credential = Credentials(); using var invalid = VaultEngine.Open(Options(root), credential); }
            catch (CryptographicException) { rejected = true; }
            Assert(rejected, "Authenticated journal header tampering was accepted");
            damaged = originalLog.ToArray(); damaged[100] ^= 1; File.WriteAllBytes(log, damaged);
            rejected = false;
            try { using var credential = Credentials(); using var invalid = VaultEngine.Open(Options(root), credential); }
            catch (CryptographicException) { rejected = true; }
            Assert(rejected, "Authenticated journal body tampering was accepted");
            File.WriteAllBytes(log, originalLog[..^5]);
            using (var credential = Credentials()) using (var torn = VaultEngine.Open(Options(root), credential))
                Assert(torn.GetInfo("folder/renamed")?.Length == 131072, "Torn terminal record discarded earlier acknowledged writes");
            Console.WriteLine("PASS abrupt termination replay, linear journal bytes, authenticated header/body refusal, torn-tail recovery and compaction");
        }
        finally { Directory.Delete(root, true); }
    }
}
