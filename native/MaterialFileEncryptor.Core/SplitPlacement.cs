using System.Text.Json;
using System.Text.RegularExpressions;
namespace MaterialFileEncryptor.Core;

/// <summary>One place that may hold copies of encrypted parts. Only ciphertext is ever placed.</summary>
public sealed record SplitLocation(string Id, string Kind, string Label, string? FolderPath, string? Repository, bool Mirror)
{
    /// <summary>Where this location keeps the encrypted part, or null for registry and main locations.</summary>
    public string? PartPath(string vaultId, string partId) => Kind != "folder" || FolderPath is null ? null
        : Mirror ? SplitPlacement.MirrorPartPath(FolderPath, vaultId, partId) : SplitPlacement.FolderPartPath(FolderPath, vaultId, partId);
}

/// <summary>A request for the desktop process to fetch one encrypted part held by a registry location.</summary>
public sealed record PlacedPartFetch(string PartId, string LocationId, string Label, string StorageRoot, string DestinationPath);

/// <summary>
/// Read-only view of <c>placement.json</c> in the main storage folder. The file records which extra
/// locations hold verified copies of each encrypted part. Parts not listed live only in the main folder.
/// The desktop process is the only writer; the engine never edits it.
/// </summary>
public sealed partial class SplitPlacement
{
    public const string FileName = "placement.json";
    public const string FolderName = "MaterialFileEncryptor-Split";
    public const string MirrorFolderName = "MaterialFileEncryptor-Mirror";
    public const long MaximumBytes = 64L * 1024 * 1024;
    private readonly Dictionary<string, SplitLocation> locations;
    private readonly Dictionary<string, string[]> parts;
    private readonly Dictionary<string, long> sizes;
    private SplitPlacement(Dictionary<string, SplitLocation> locations, Dictionary<string, string[]> parts, Dictionary<string, long> sizes)
    { this.locations = locations; this.parts = parts; this.sizes = sizes; }

    [GeneratedRegex(@"\A[a-z0-9-]{1,64}\z")] private static partial Regex LocationId();
    [GeneratedRegex(@"\A(?:[0-9a-f]{32}|[0-9a-f]{64})\z")] private static partial Regex PartId();

    public IReadOnlyCollection<SplitLocation> Locations => locations.Values;
    public SplitLocation? Location(string id) => locations.GetValueOrDefault(id);
    /// <summary>Extra (non-main) locations that hold a verified copy of the part, in recorded order.</summary>
    public IReadOnlyList<SplitLocation> Holders(string partId) =>
        parts.TryGetValue(partId, out var held) ? held.Where(id => id != "main").Select(id => locations[id]).ToArray() : [];
    public bool IsPlaced(string partId) => parts.TryGetValue(partId, out var held) && held.Any(id => id != "main");
    public long? RecordedSize(string partId) => sizes.TryGetValue(partId, out var size) ? size : null;
    public static string FolderPartPath(string folder, string vaultId, string partId) =>
        Path.Combine(folder, FolderName, vaultId, "parts", partId + ".mfe");
    public static string MirrorPartPath(string folder, string vaultId, string partId) =>
        Path.Combine(folder, MirrorFolderName, vaultId, "parts", partId + ".mfe");
    /// <summary>Connected folder mirrors. A mirror is a complete storage folder, so it may serve any part.</summary>
    public IReadOnlyList<SplitLocation> FolderMirrors => locations.Values.Where(l => l.Mirror && l.Kind == "folder").ToArray();

    /// <summary>Returns null when the drive does not use split storage.</summary>
    public static SplitPlacement? Load(string storageRoot, string vaultId)
    {
        var path = Path.Combine(storageRoot, FileName);
        if (!File.Exists(path)) return null;
        return Parse(VaultCrypto.ReadBounded(path, MaximumBytes), vaultId, storageRoot);
    }

    internal static SplitPlacement Parse(byte[] bytes, string vaultId, string storageRoot)
    {
        static InvalidDataException Damaged() => new("The split storage placement file is damaged. Encrypted parts in other locations cannot be found until it is repaired.");
        try
        {
            using var document = JsonDocument.Parse(bytes, new JsonDocumentOptions { MaxDepth = 16 });
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("format", out var format) || format.ValueKind != JsonValueKind.Number || format.GetInt32() != 1) throw Damaged();
            if (!root.TryGetProperty("vaultId", out var id) || id.GetString() != vaultId) throw new InvalidDataException("The split storage placement file belongs to a different drive.");
            var locations = new Dictionary<string, SplitLocation>(StringComparer.Ordinal);
            if (!root.TryGetProperty("locations", out var list) || list.ValueKind != JsonValueKind.Array || list.GetArrayLength() > 64) throw Damaged();
            foreach (var item in list.EnumerateArray())
            {
                string? text(string name) => item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
                string locationId = text("id") ?? throw Damaged(), kind = text("kind") ?? throw Damaged(), label = text("label") ?? "";
                if (!LocationId().IsMatch(locationId) || label.Length > 200 || locations.ContainsKey(locationId)) throw Damaged();
                if ((locationId == "main") != (kind == "main")) throw Damaged();
                string? folder = null, repository = null;
                bool mirror = text("role") switch { null or "share" => false, "mirror" => true, _ => throw Damaged() };
                if (mirror && kind == "main") throw Damaged();
                if (kind == "folder")
                {
                    folder = text("path") ?? throw Damaged();
                    if (folder.Length > 32767 || folder.Contains('\0') || !Path.IsPathFullyQualified(folder)) throw Damaged();
                    folder = Path.GetFullPath(folder);
                    var main = Path.GetFullPath(storageRoot);
                    if (Within(folder, main) || Within(main, folder)) throw Damaged();
                }
                else if (kind == "registry") repository = text("repository") ?? throw Damaged();
                else if (kind != "main") throw Damaged();
                locations.Add(locationId, new(locationId, kind, label, folder, repository, mirror));
            }
            var parts = new Dictionary<string, string[]>(StringComparer.Ordinal);
            if (root.TryGetProperty("parts", out var map))
            {
                if (map.ValueKind != JsonValueKind.Object) throw Damaged();
                foreach (var pair in map.EnumerateObject())
                {
                    if (!PartId().IsMatch(pair.Name) || pair.Value.ValueKind != JsonValueKind.Array || pair.Value.GetArrayLength() is < 1 or > 64) throw Damaged();
                    var held = pair.Value.EnumerateArray().Select(value => value.GetString() ?? throw Damaged()).ToArray();
                    if (held.Distinct(StringComparer.Ordinal).Count() != held.Length || held.Any(location => !locations.ContainsKey(location))) throw Damaged();
                    parts[pair.Name] = held;
                }
            }
            var sizes = new Dictionary<string, long>(StringComparer.Ordinal);
            if (root.TryGetProperty("sizes", out var sizeMap) && sizeMap.ValueKind == JsonValueKind.Object)
                foreach (var pair in sizeMap.EnumerateObject())
                    if (PartId().IsMatch(pair.Name) && pair.Value.ValueKind == JsonValueKind.Number && pair.Value.TryGetInt64(out var size) && size >= 0) sizes[pair.Name] = size;
            return new(locations, parts, sizes);
        }
        catch (Exception error) when (error is JsonException or InvalidOperationException or FormatException) { throw Damaged(); }
    }
    private static bool Within(string child, string parent) =>
        child.Equals(parent, StringComparison.OrdinalIgnoreCase) || child.StartsWith(parent.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
}
