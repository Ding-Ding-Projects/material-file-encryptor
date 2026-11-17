using MaterialFileEncryptor.Core;
using System.Security.Cryptography;
using System.Text.Json;

/// <summary>Split storage read path: parts that live outside the main storage folder.</summary>
internal static class SplitStorageTests
{
    private sealed class Fixture : IDisposable
    {
        internal readonly string Root = Path.Combine(Path.GetTempPath(), "mfe-split-" + Guid.NewGuid().ToString("N"));
        internal string Source => Path.Combine(Root, "source");
        internal string Extra => Path.Combine(Root, "usb");
        internal VaultOptions Options(string cache = "cache") => new() { StorageRoot = Source, CacheRoot = Path.Combine(Root, cache), PartSizeBytes = 1024 };
        internal VaultEngine Create() { using var c = VaultCredentials.Password("split test credential"); return VaultEngine.Create(Options(), c); }
        internal VaultEngine Open(string cache) { using var c = VaultCredentials.Password("split test credential"); var engine = VaultEngine.Open(Options(cache), c); engine.SyncAsync().GetAwaiter().GetResult(); return engine; }
        public void Dispose() { if (Directory.Exists(Root)) Directory.Delete(Root, true); }
    }
    private static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    private static byte[] Read(VaultEngine engine, string path)
    { var bytes = new byte[checked((int)engine.GetInfo(path)!.Length)]; Assert(engine.ReadRange(path, 0, bytes) == bytes.Length, "Short read"); return bytes; }

    /// <summary>Creates a drive with one file and returns its content and part identifiers.</summary>
    private static (byte[] Content, string VaultId, string[] Parts) Seed(Fixture fixture)
    {
        var content = RandomNumberGenerator.GetBytes(5000);
        using var engine = fixture.Create();
        engine.CreateDirectory("Projects"); engine.CreateFile("Projects/big.bin"); engine.WriteRange("Projects/big.bin", 0, content);
        engine.FlushAsync().GetAwaiter().GetResult();
        var parts = Directory.GetFiles(Path.Combine(fixture.Source, "parts"), "*.mfe").Select(path => Path.GetFileNameWithoutExtension(path)!).ToArray();
        return (content, engine.VaultId, parts);
    }
    private static void WritePlacement(Fixture fixture, string vaultId, object[] locations, Dictionary<string, string[]> parts)
    {
        var value = new Dictionary<string, object?> { ["format"] = 1, ["vaultId"] = vaultId, ["revision"] = 1, ["copies"] = 1, ["locations"] = locations, ["rules"] = Array.Empty<object>(), ["parts"] = parts };
        File.WriteAllText(Path.Combine(fixture.Source, SplitPlacement.FileName), JsonSerializer.Serialize(value));
    }
    private static object MainLocation() => new { id = "main", kind = "main", label = "Main storage" };
    private static object Folder(string id, string label, string path, string role = "share") => new { id, kind = "folder", label, path, role };

    /// <summary>Moves every part from the main folder to a split folder location.</summary>
    private static void MoveToFolder(Fixture fixture, string vaultId, string[] parts)
    {
        foreach (var part in parts)
        {
            var target = SplitPlacement.FolderPartPath(fixture.Extra, vaultId, part);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Move(Path.Combine(fixture.Source, "parts", part + ".mfe"), target);
        }
        WritePlacement(fixture, vaultId, [MainLocation(), Folder("usb-1", "USB backup (E:)", fixture.Extra)], parts.ToDictionary(p => p, _ => new[] { "usb-1" }));
    }

    internal static void FolderLocation()
    {
        using var fixture = new Fixture();
        var (content, vaultId, parts) = Seed(fixture);
        MoveToFolder(fixture, vaultId, parts);
        using var engine = fixture.Open("fresh");
        Assert(Read(engine, "Projects/big.bin").SequenceEqual(content), "A part held in a folder location was not read back.");
        Assert(parts.All(p => File.Exists(Path.Combine(fixture.Root, "fresh", "parts", p + ".mfe"))), "Hydrated parts were not cached.");
        Assert(parts.All(p => !File.Exists(Path.Combine(fixture.Source, "parts", p + ".mfe"))), "Reading copied parts back into the main folder.");
        // History views treat placed parts as present, not missing.
        engine.SaveVersionAsync("Projects/big.bin").GetAwaiter().GetResult();
        Assert(engine.ListVersions().All(v => v.IsAvailable), "Placed parts were reported as unavailable history.");
        // Publication never copies a placed part back into the main folder.
        engine.WriteRange("Projects/big.bin", 0, "edit"u8); engine.FlushAsync().GetAwaiter().GetResult();
        Assert(parts.All(p => !File.Exists(Path.Combine(fixture.Source, "parts", p + ".mfe"))), "Publication restored a placed part to the main folder.");
    }

    internal static void MissingLocation()
    {
        using var fixture = new Fixture();
        var (_, vaultId, parts) = Seed(fixture);
        MoveToFolder(fixture, vaultId, parts);
        var unplugged = fixture.Extra + "-unplugged"; Directory.Move(fixture.Extra, unplugged);
        using var engine = fixture.Open("fresh");
        try { Read(engine, "Projects/big.bin"); throw new Exception("A disconnected location was read."); }
        catch (SplitLocationUnavailableException error) { Assert(error.Message == "This file is stored on USB backup (E:), which is not connected.", "Unexpected message: " + error.Message); }
        var affected = engine.GetSplitAffectedFiles(["usb-1"], 50);
        Assert(affected.Count == 1 && affected.Paths.Single() == "Projects/big.bin", "Affected files were not reported.");
        // Reconnecting the drive makes the file readable again; nothing was deleted.
        Directory.Move(unplugged, fixture.Extra);
        Assert(Read(engine, "Projects/big.bin").Length == 5000, "Reconnected location was not used.");
    }

    internal static void DamagedFolderCopy()
    {
        using var fixture = new Fixture();
        var (_, vaultId, parts) = Seed(fixture);
        MoveToFolder(fixture, vaultId, parts);
        var victim = SplitPlacement.FolderPartPath(fixture.Extra, vaultId, parts[0]);
        var bytes = File.ReadAllBytes(victim); bytes[^5] ^= 0x55; File.WriteAllBytes(victim, bytes);
        using var engine = fixture.Open("fresh");
        bool refused = false;
        try { Read(engine, "Projects/big.bin"); } catch (SplitLocationUnavailableException) { refused = true; }
        Assert(refused, "A damaged placed copy was accepted.");
        Assert(!File.Exists(Path.Combine(fixture.Root, "fresh", "parts", parts[0] + ".mfe")), "A damaged placed copy reached the cache.");
    }

    internal static void RegistryHydration()
    {
        using var fixture = new Fixture();
        var (content, vaultId, parts) = Seed(fixture);
        var held = Path.Combine(fixture.Root, "registry-layers"); Directory.CreateDirectory(held);
        foreach (var part in parts) File.Move(Path.Combine(fixture.Source, "parts", part + ".mfe"), Path.Combine(held, part));
        WritePlacement(fixture, vaultId, [MainLocation(), new { id = "hub-1", kind = "registry", label = "Docker Hub", repository = "someone/vault-parts" }], parts.ToDictionary(p => p, _ => new[] { "hub-1" }));
        using var engine = fixture.Open("fresh");
        var requests = new List<PlacedPartFetch>();
        engine.FetchPlacedPartAsync = (request, token) =>
        {
            requests.Add(request);
            Assert(request.LocationId == "hub-1" && request.StorageRoot == Path.GetFullPath(fixture.Source), "Unexpected fetch request.");
            Assert(request.DestinationPath.StartsWith(Path.Combine(fixture.Root, "fresh", "parts"), StringComparison.OrdinalIgnoreCase), "Fetch target is outside the cache.");
            File.Copy(Path.Combine(held, request.PartId), request.DestinationPath);
            return Task.CompletedTask;
        };
        // Registry fetches never run under the namespace lock: a direct read asks for preparation first.
        bool deferred = false;
        try { Read(engine, "Projects/big.bin"); } catch (VaultHydrationRequiredException) { deferred = true; }
        Assert(deferred, "A registry fetch was attempted under the namespace lock.");
        engine.PrepareEntryAsync(engine.GetInfo("Projects/big.bin")!.EntryId).GetAwaiter().GetResult();
        Assert(Read(engine, "Projects/big.bin").SequenceEqual(content), "Registry-held part was not read back.");
        Assert(requests.Select(r => r.PartId).Distinct().Count() == parts.Length && requests.Count == parts.Length, "Each part should be fetched exactly once.");

        // Bytes from the desktop process are authenticated: a tampered answer is refused.
        using var second = fixture.Open("tampered");
        second.FetchPlacedPartAsync = (request, token) => { var bytes = File.ReadAllBytes(Path.Combine(held, request.PartId)); bytes[^3] ^= 1; File.WriteAllBytes(request.DestinationPath, bytes); return Task.CompletedTask; };
        bool refused = false;
        try { second.PrepareEntryAsync(second.GetInfo("Projects/big.bin")!.EntryId).GetAwaiter().GetResult(); } catch (SplitLocationUnavailableException) { refused = true; }
        Assert(refused, "Tampered registry bytes were accepted.");
        Assert(Directory.GetFiles(Path.Combine(fixture.Root, "tampered", "parts")).Length == 0, "Rejected fetch left files in the cache.");
    }

    internal static void EvictionKeepsOnlyCopy()
    {
        using var fixture = new Fixture();
        var (_, vaultId, parts) = Seed(fixture);
        MoveToFolder(fixture, vaultId, parts);
        using var engine = fixture.Open("fresh");
        Read(engine, "Projects/big.bin");
        var unplugged = fixture.Extra + "-unplugged"; Directory.Move(fixture.Extra, unplugged);
        Assert(engine.EvictCache(long.MaxValue) == 0 && engine.EvictEntryCache("") == 0, "Evicted the only reachable copy while its location was disconnected.");
        Directory.Move(unplugged, fixture.Extra);
        Assert(engine.EvictCache(long.MaxValue) > 0, "A verified placed copy should allow eviction.");
        Assert(Read(engine, "Projects/big.bin").Length == 5000, "Evicted part could not be read back from its location.");
    }

    /// <summary>A mirror is a complete storage folder: it opens on its own and also serves the read path.</summary>
    internal static void MirrorOpensAndServesReads()
    {
        using var fixture = new Fixture();
        var (content, vaultId, parts) = Seed(fixture);
        var mirrorRoot = Path.Combine(fixture.Root, "mirror-disk");
        var mirror = Path.Combine(mirrorRoot, SplitPlacement.MirrorFolderName, vaultId);
        foreach (var file in Directory.GetFiles(fixture.Source, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(fixture.Source, file);
            if (relative == SplitPlacement.FileName) continue;
            var target = Path.Combine(mirror, relative); Directory.CreateDirectory(Path.GetDirectoryName(target)!); File.Copy(file, target);
        }
        using (var c = VaultCredentials.Password("split test credential"))
        using (var opened = VaultEngine.Open(new VaultOptions { StorageRoot = mirror, CacheRoot = Path.Combine(fixture.Root, "mirror-cache"), PartSizeBytes = 1024 }, c))
        {
            opened.SyncAsync().GetAwaiter().GetResult();
            Assert(Read(opened, "Projects/big.bin").SequenceEqual(content), "A mirror did not open as a storage folder.");
        }
        // The main folder lost its parts; the read path falls back to the connected mirror.
        foreach (var part in parts) File.Delete(Path.Combine(fixture.Source, "parts", part + ".mfe"));
        WritePlacement(fixture, vaultId, [MainLocation(), Folder("mirror-1", "Backup folder", mirrorRoot, "mirror")], []);
        using var engine = fixture.Open("fresh");
        Assert(Read(engine, "Projects/big.bin").SequenceEqual(content), "The read path did not fall back to a mirror.");
    }

    internal static void RulePatterns()
    {
        Assert(VaultEngine.SplitRulePattern("Projects/**").IsMatch("projects/a/b.txt"), "** should cross folders.");
        Assert(!VaultEngine.SplitRulePattern("Projects/*").IsMatch("Projects/a/b.txt"), "* should stay within one name.");
        Assert(VaultEngine.SplitRulePattern("*.mp4").IsMatch("clip.MP4"), "Name patterns are case-insensitive.");
        foreach (var bad in new[] { "", "../x", "a\\b", new string('a', 300) })
        { bool refused = false; try { VaultEngine.SplitRulePattern(bad); } catch (ArgumentException) { refused = true; } Assert(refused, "Accepted invalid rule: " + bad); }
        using var fixture = new Fixture();
        using var engine = fixture.Create();
        engine.CreateDirectory("Projects"); engine.CreateFile("Projects/a.txt"); engine.WriteRange("Projects/a.txt", 0, "a"u8);
        engine.CreateFile("clip.mp4"); engine.WriteRange("clip.mp4", 0, "b"u8); engine.CreateFile("other.txt"); engine.WriteRange("other.txt", 0, "c"u8);
        engine.FlushAsync().GetAwaiter().GetResult();
        var inventory = engine.GetSplitInventory([("Projects/**", "usb-1"), ("*.mp4", "hub-1")]);
        Assert(inventory.Count == 3, "Inventory should list each part once.");
        Assert(inventory.Count(p => p.Pin == "usb-1") == 1 && inventory.Count(p => p.Pin == "hub-1") == 1 && inventory.Count(p => p.Pin is null) == 1, "Rules did not pin parts.");
        Assert(inventory.All(p => p.Size > 0), "Inventory sizes are missing.");
    }

    internal static void DamagedPlacementFile()
    {
        using var fixture = new Fixture();
        var (_, vaultId, parts) = Seed(fixture);
        MoveToFolder(fixture, vaultId, parts);
        File.WriteAllText(Path.Combine(fixture.Source, SplitPlacement.FileName), "{\"format\":1,\"vaultId\":\"" + vaultId + "\",\"locations\":[{\"id\":\"x\",\"kind\":\"folder\",\"path\":\"relative\"}]}");
        using var engine = fixture.Open("fresh");
        bool refused = false;
        // Either the incoming version stays incomplete (the last usable view is kept) or the read fails closed.
        if (engine.GetInfo("Projects/big.bin") is null) refused = true;
        else try { Read(engine, "Projects/big.bin"); } catch (Exception error) when (error is IOException or InvalidDataException) { refused = true; }
        Assert(refused, "A damaged placement file was trusted.");
        Assert(Directory.GetFiles(Path.GetDirectoryName(SplitPlacement.FolderPartPath(fixture.Extra, vaultId, parts[0]))!).Length == parts.Length, "A damaged placement file caused deletion.");
    }
}
