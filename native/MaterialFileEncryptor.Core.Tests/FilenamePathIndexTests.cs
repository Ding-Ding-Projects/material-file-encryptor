using System.Collections;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using MaterialFileEncryptor.Core;

internal static class FilenamePathIndexTests
{
    private static readonly FieldInfo EntriesField = typeof(VaultEngine).GetField("entries", BindingFlags.Instance | BindingFlags.NonPublic)!;
    private static readonly PropertyInfo StoredPathProperty = typeof(Entry).GetProperty("StoredPath", BindingFlags.Instance | BindingFlags.NonPublic)!;

    private sealed class Fixture : IDisposable
    {
        internal readonly string Root = Path.Combine(Path.GetTempPath(), "mfe-path-index-" + Guid.NewGuid().ToString("N"));
        internal VaultOptions Options(string cache = "cache") => new() { StorageRoot = Path.Combine(Root, "source"), CacheRoot = Path.Combine(Root, cache), PartSizeBytes = 65536 };
        internal VaultCredentials Credentials() => VaultCredentials.KeyFile(Enumerable.Range(0, 32).Select(value => (byte)(value + 41)).ToArray());
        internal VaultEngine Create() { using var credentials = Credentials(); return VaultEngine.Create(Options(), credentials); }
        internal VaultEngine Open(string cache = "cache") { using var credentials = Credentials(); return VaultEngine.Open(Options(cache), credentials); }
        public void Dispose()
        {
            string target = Path.GetFullPath(Root);
            string temporaryRoot = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            if (!target.StartsWith(temporaryRoot, StringComparison.OrdinalIgnoreCase) || !Path.GetFileName(target).StartsWith("mfe-path-index-", StringComparison.Ordinal))
                throw new InvalidOperationException("Fixture cleanup escaped its temporary root.");
            if (Directory.Exists(target)) Directory.Delete(target, true);
        }
    }

    private static void Require(bool condition, string message) { if (!condition) throw new Exception(message); }
    private static IDictionary Entries(VaultEngine engine) => (IDictionary)EntriesField.GetValue(engine)!;
    private static void CheckIndex(VaultEngine engine, string stage)
    {
        // Inspect before GetInfo can populate or repair a lazy path cache.
        foreach (DictionaryEntry pair in Entries(engine))
        {
            string path = (string)pair.Key;
            var entry = (Entry)pair.Value!;
            Require(string.Equals((string?)StoredPathProperty.GetValue(entry), path, StringComparison.Ordinal), stage + ": stored path was absent or stale for " + path);
            Require(!JsonSerializer.Serialize(entry).Contains("StoredPath", StringComparison.OrdinalIgnoreCase), stage + ": runtime path entered serialized metadata.");
        }
    }
    private static void CheckLookups(VaultEngine engine)
    {
        foreach (string path in Entries(engine).Keys)
            Require(engine.GetInfo(path.ToUpperInvariant())!.Path == path, "Case-insensitive lookup changed the stored path: " + path);
    }
    private static void CheckBytes(VaultEngine engine, string path, byte[] expected)
    {
        byte[] actual = new byte[expected.Length];
        Require(engine.ReadRange(path, 0, actual) == actual.Length && actual.SequenceEqual(expected), "Content changed: " + path);
    }

    internal static void Run()
    {
        NamespaceLifecycle();
        JournalReplay();
        HistoricalRestore();
        RecycleRollback();
        PackingRename(false);
        PackingRename(true);
    }

    private static void NamespaceLifecycle()
    {
        using var fixture = new Fixture();
        using (var engine = fixture.Create())
        {
            for (int index = 0; index < 1024; index++) engine.CreateFile($"item{index:D4}.tXt");
            CheckIndex(engine, "cold creation");
            engine.CreateDirectory("OuterFolder");
            engine.CreateDirectory("OuterFolder/innerDirectory");
            using (var import = engine.BeginImport("OuterFolder/innerDirectory/MiXeD.Extension"))
            {
                import.Write(0, "synthetic staged import"u8);
                import.Commit();
            }
            CheckIndex(engine, "staged import");
            engine.Rename("item0000.tXt", "Item0000.TXT");
            CheckIndex(engine, "file case-only rename");
            engine.Rename("OuterFolder", "OUTERfolder");
            CheckIndex(engine, "subtree case-only rename");
            engine.Rename("OUTERfolder", "renamedFolder");
            CheckIndex(engine, "subtree move");
            CheckLookups(engine);
            engine.FlushAsync().GetAwaiter().GetResult();
        }
        using var reopened = fixture.Open();
        CheckIndex(reopened, "reopened namespace");
        using (var writer = fixture.Open("writer-cache"))
        {
            CheckIndex(writer, "fresh-cache sync");
            writer.CreateFile("addedRemote.MiXeD");
            writer.FlushAsync().GetAwaiter().GetResult();
        }
        reopened.SyncAsync().GetAwaiter().GetResult();
        CheckIndex(reopened, "incoming sync");
        Require(Entries(reopened).Contains("addedRemote.MiXeD"), "Incoming namespace entry was absent.");
        CheckLookups(reopened);
        using var destination = new Fixture();
        using var credentials = destination.Credentials();
        using var upgraded = reopened.CopyUpgradeAsync(destination.Options(), credentials).GetAwaiter().GetResult();
        CheckIndex(upgraded, "copy upgrade");
        CheckLookups(upgraded);
        CheckBytes(upgraded, "renamedFolder/innerDirectory/MiXeD.Extension", "synthetic staged import"u8.ToArray());
    }

    private static void JournalReplay()
    {
        using var fixture = new Fixture();
        using var original = fixture.Create();
        original.CreateFile("BaseCase.txt");
        original.WriteRange("BaseCase.txt", 0, "checkpoint fixture"u8);
        original.SetPartSize(65536);
        original.CreateDirectory("JournalDir");
        original.CreateFile("JournalDir/Initial.txt");
        original.WriteRange("JournalDir/Initial.txt", 0, "journal fixture"u8);
        original.Rename("JournalDir", "JournalDIR");
        original.SetBasicInfo("JOURNALDIR/INITIAL.TXT", attributes: 1);
        original.FlushLocalOnly();
        Require(original.JournalStatistics.AppendedFrames > 0, "Journal replay fixture has no appended frames.");
        string copiedCache = Path.Combine(fixture.Root, "replay-cache");
        foreach (string source in Directory.EnumerateFiles(original.CacheRoot, "*", SearchOption.AllDirectories))
        {
            string destination = Path.Combine(copiedCache, Path.GetRelativePath(original.CacheRoot, source));
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            File.Copy(source, destination);
        }
        byte[] master = original.ExportMasterKey();
        try
        {
            var config = JsonSerializer.Deserialize<Config>(File.ReadAllBytes(Path.Combine(copiedCache, "vault.json")))!;
            var constructor = typeof(VaultEngine).GetConstructor(BindingFlags.Instance | BindingFlags.NonPublic, null, new[] { typeof(VaultOptions), typeof(Config), typeof(byte[]) }, null)!;
            // Construct directly so SyncAsync cannot mask a missing journal seed.
            using var replayed = (VaultEngine)constructor.Invoke(new object[] { fixture.Options("replay-cache"), config, master });
            CheckIndex(replayed, "journal snapshot and create/rename/update replay");
            Require(Entries(replayed).Count == 3, "Journal replay fixture lost namespace entries.");
            Require(replayed.GetInfo("JOURNALDIR/INITIAL.TXT")!.Path == "JournalDIR/Initial.txt", "Journal rename retained old casing.");
            Require(replayed.GetInfo("JournalDIR/Initial.txt")!.Attributes == 1, "Journal update was not replayed.");
            CheckBytes(replayed, "JournalDIR/Initial.txt", "journal fixture"u8.ToArray());
        }
        finally { CryptographicOperations.ZeroMemory(master); }
    }

    private static void HistoricalRestore()
    {
        using var fixture = new Fixture();
        using var engine = fixture.Create();
        engine.CreateFile("OriginalCase.txt");
        engine.WriteRange("OriginalCase.txt", 0, "old"u8);
        engine.SaveVersionAsync("OriginalCase.txt").GetAwaiter().GetResult();
        string version = engine.ListVersions().Single().Id;
        engine.Rename("OriginalCase.txt", "originalcase.TXT");
        engine.WriteRange("originalcase.TXT", 0, "new"u8);
        engine.RestoreVersionAsync(version).GetAwaiter().GetResult();
        CheckIndex(engine, "historical replacement after case-only rename");
        Require(engine.Enumerate("").Single().Path == "originalcase.TXT", "Historical restore changed the current dictionary key.");
        Require(engine.GetInfo("ORIGINALCASE.TXT")!.Path == "originalcase.TXT", "Historical restore returned its old path spelling.");
        CheckBytes(engine, "originalcase.TXT", "old"u8.ToArray());
    }

    private static void RecycleRollback()
    {
        using var fixture = new Fixture();
        using var engine = fixture.Create();
        engine.CreateFile("RestoreMe.TXT");
        engine.WriteRange("RestoreMe.TXT", 0, "restore first"u8);
        engine.Delete("RestoreMe.TXT");
        engine.CreateDirectory("Blocked");
        engine.CreateFile("Blocked/Deep.TXT");
        engine.WriteRange("Blocked/Deep.TXT", 0, "blocked child"u8);
        engine.Delete("Blocked/Deep.TXT");
        engine.Delete("Blocked");
        engine.CreateFile("BLOCKED");
        engine.WriteRange("BLOCKED", 0, "preserved blocker"u8);
        engine.CreateFile("KeepCase.txt");
        string[] selected = engine.ListDeleted().Where(entry => entry.Path is "RestoreMe.TXT" or "Blocked/Deep.TXT").Select(entry => entry.Id).ToArray();
        Require(selected.Length == 2, "Rollback fixture selection is incomplete.");
        var previousEntries = Entries(engine);
        var previousDeleted = engine.ListDeleted().Select(entry => entry.Id).ToHashSet();
        bool rejected = false;
        try { engine.RestoreDeletedAsync(selected).GetAwaiter().GetResult(); }
        catch (IOException error) when (error.Message == "Restore parent is occupied by a file.") { rejected = true; }
        Require(rejected, "The deeper restore was not rejected after the shallow restore.");
        Require(!ReferenceEquals(previousEntries, Entries(engine)), "Restore did not exercise namespace rollback.");
        CheckIndex(engine, "recycle restore rollback");
        Require(Entries(engine).Count == 2 && !Entries(engine).Contains("RestoreMe.TXT"), "A partial restore survived rollback.");
        Require(engine.ListDeleted().Select(entry => entry.Id).ToHashSet().SetEquals(previousDeleted), "Rollback lost recycle entries.");
        CheckBytes(engine, "BLOCKED", "preserved blocker"u8.ToArray());
    }

    private static void PackingRename(bool failAdoption)
    {
        using var fixture = new Fixture();
        using var engine = fixture.Create();
        byte[] bytes = Enumerable.Range(0, 6000).Select(index => (byte)(index % 251)).ToArray();
        engine.CreateFile("PackedFile.bin");
        engine.WriteRange("PackedFile.bin", 0, bytes);
        engine.FlushLocalOnly();
        bool renamed = false, adoptionReached = false, rejected = false;
        engine.PackingTestPoint = point =>
        {
            if (point == "packed") { engine.Rename("PackedFile.bin", "pACKEDfile.BIN"); renamed = true; }
            if (point == "before-adoption")
            {
                adoptionReached = true;
                if (failAdoption) throw new IOException("Injected filename-index adoption fault.");
            }
        };
        try { engine.PackAsync("PackedFile.bin", 2048).GetAwaiter().GetResult(); }
        catch (IOException error) when (failAdoption && error.Message == "Injected filename-index adoption fault.") { rejected = true; }
        finally { engine.PackingTestPoint = null; }
        Require(renamed && adoptionReached && rejected == failAdoption, "Packing did not exercise the requested adoption path.");
        CheckIndex(engine, failAdoption ? "packing rollback after case-only rename" : "packing replacement after case-only rename");
        Require(engine.Enumerate("").Single().Path == "pACKEDfile.BIN", "Packing changed the renamed dictionary key.");
        var metadata = engine.GetInfo("PACKEDFILE.BIN")!;
        Require(metadata.Path == "pACKEDfile.BIN" && metadata.PartSizeBytes == (failAdoption ? 65536 : 2048), "Packing retained stale casing or the wrong data map.");
        CheckBytes(engine, "pACKEDfile.BIN", bytes);
    }
}
