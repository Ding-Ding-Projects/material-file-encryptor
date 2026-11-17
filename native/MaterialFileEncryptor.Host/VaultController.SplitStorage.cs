using System.Text.Json;
using System.Text.RegularExpressions;

namespace MaterialFileEncryptor.Host;

/// <summary>
/// Split storage planning queries. Paths never leave this process except the bounded list of
/// affected file names the desktop shows. Moving parts is done by the desktop process while it holds
/// the locked storage folder lease, never through these commands.
/// </summary>
internal sealed partial class VaultController
{
    private static readonly Regex SplitLocationId = new(@"\A(?:spread|[a-z0-9-]{1,64})\z", RegexOptions.CultureInvariant);

    private object SplitStorageInventory(JsonElement args)
    {
        var rules = new List<(string Match, string Location)>();
        if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty("rules", out var list))
        {
            if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() > 100) throw new ArgumentException("Use at most 100 placement rules.");
            foreach (var rule in list.EnumerateArray())
            {
                string match = rule.TryGetProperty("match", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString()! : throw new ArgumentException("Invalid placement rule.");
                string location = rule.TryGetProperty("location", out var l) && l.ValueKind == JsonValueKind.String ? l.GetString()! : throw new ArgumentException("Invalid placement rule.");
                if (!SplitLocationId.IsMatch(location)) throw new ArgumentException("Invalid placement rule.");
                rules.Add((match, location == "spread" ? "" : location));
            }
        }
        MaterialFileEncryptor.Core.VaultEngine captured; lock (gate) { captured = Engine; ++activePreparedOperations; }
        try
        {
            var parts = captured.GetSplitInventory(rules.Select(rule => (rule.Match, rule.Location)).ToArray());
            // Compact rows keep large drives inside the pipe response limit.
            return new { vaultId = captured.VaultId, storageDir = captured.StorageRoot, parts = parts.Select(part => new object?[] { part.Id, part.Size, string.IsNullOrEmpty(part.Pin) ? null : part.Pin }).ToArray() };
        }
        finally { lock (gate) --activePreparedOperations; }
    }

    private object SplitStorageAffected(JsonElement args)
    {
        var disconnected = new List<string>();
        if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty("disconnected", out var list))
        {
            if (list.ValueKind != JsonValueKind.Array || list.GetArrayLength() > 64) throw new ArgumentException("Invalid location list.");
            foreach (var item in list.EnumerateArray())
            {
                string id = item.ValueKind == JsonValueKind.String ? item.GetString()! : throw new ArgumentException("Invalid location list.");
                if (!SplitLocationId.IsMatch(id) || id == "spread") throw new ArgumentException("Invalid location list.");
                disconnected.Add(id);
            }
        }
        int limit = (int)Math.Clamp(OptionalLong(args, "limit") ?? 50, 0, 200);
        MaterialFileEncryptor.Core.VaultEngine captured; lock (gate) { captured = Engine; ++activePreparedOperations; }
        try { var result = captured.GetSplitAffectedFiles(disconnected, limit); return new { count = result.Count, paths = result.Paths }; }
        finally { lock (gate) --activePreparedOperations; }
    }
}
