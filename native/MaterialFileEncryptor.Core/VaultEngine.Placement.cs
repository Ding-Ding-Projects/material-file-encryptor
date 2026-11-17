using System.Text.RegularExpressions;
namespace MaterialFileEncryptor.Core;

/// <summary>A planning view of one encrypted part for split storage.</summary>
public sealed record SplitInventoryPart(string Id, long Size, string? Pin);
/// <summary>Files that cannot be read while the named locations are disconnected.</summary>
public sealed record SplitAffectedFiles(int Count, IReadOnlyList<string> Paths);
/// <summary>A part is held only by split storage locations that are not connected. The message names them and is safe to show.</summary>
public sealed class SplitLocationUnavailableException(string message) : IOException(message);

/// <summary>
/// Split storage read path. Encrypted parts may live in extra locations recorded by placement.json in the
/// main storage folder. A missing part is copied into the cache from a connected folder location or
/// mirror (verified before use), or fetched through the desktop process for registry locations.
/// The engine only reads placement.json; it never moves or deletes placed copies.
/// </summary>
public sealed partial class VaultEngine
{
    private readonly object placementGate = new();
    private readonly SemaphoreSlim registryFetches = new(1, 1);
    private SplitPlacement? placement;
    private (long Length, DateTime Written) placementStamp;
    /// <summary>Fetches a registry-held part into the named temporary path. Set by the host.</summary>
    public Func<PlacedPartFetch, CancellationToken, Task>? FetchPlacedPartAsync { get; set; }
    public TimeSpan PlacedFetchTimeout { get; set; } = TimeSpan.FromMinutes(5);

    /// <summary>The current placement, reloaded when the file changes. Throws when the file is damaged.</summary>
    internal SplitPlacement? CurrentPlacement()
    {
        var path = Path.Combine(source, SplitPlacement.FileName);
        lock (placementGate)
        {
            var info = new FileInfo(path);
            if (!info.Exists) { placement = null; placementStamp = default; return null; }
            var stamp = (info.Length, info.LastWriteTimeUtc);
            if (placement is null || stamp != placementStamp) { placement = SplitPlacement.Load(source, config.VaultId); placementStamp = stamp; }
            return placement;
        }
    }
    private SplitPlacement? PlacementOrNull() { try { return CurrentPlacement(); } catch (Exception error) when (error is IOException or InvalidDataException or UnauthorizedAccessException or ArgumentException) { return null; } }
    private bool HasPlacement => PlacementOrNull() is { } current && current.Locations.Any(location => location.Kind != "main");
    private bool CanHydrate => HydrateEncryptedFileAsync is not null || HasPlacement;

    /// <summary>True when a part missing from the main folder is held by a share location or a mirror.</summary>
    private bool PlacedElsewhere(string id)
    {
        var current = PlacementOrNull(); if (current is null) return false;
        if (current.IsPlaced(id)) return true;
        return current.FolderMirrors.Any(mirror => SafeExists(mirror.PartPath(config.VaultId, id)));
    }
    /// <summary>
    /// Availability for metadata and history: a recorded share copy counts even while its location is disconnected,
    /// so files stay visible and reads report which location to connect. Mirrors count only when connected.
    /// </summary>
    private bool PlacedAvailable(string id)
    {
        var current = PlacementOrNull(); if (current is null) return false;
        return current.IsPlaced(id) || current.FolderMirrors.Any(mirror => SafeExists(mirror.PartPath(config.VaultId, id)));
    }
    private static bool SafeExists(string? path) { try { return path is not null && File.Exists(path); } catch (Exception error) when (error is IOException or UnauthorizedAccessException or ArgumentException) { return false; } }

    /// <summary>Connected folder copies (shares first, then mirrors) that could provide the part.</summary>
    private IEnumerable<string> FolderCopies(SplitPlacement current, string id)
    {
        foreach (var holder in current.Holders(id).Where(h => h.Kind == "folder")) { var path = holder.PartPath(config.VaultId, id); if (SafeExists(path)) yield return path!; }
        foreach (var mirror in current.FolderMirrors) { var path = mirror.PartPath(config.VaultId, id); if (SafeExists(path)) yield return path!; }
    }
    /// <summary>A placed folder copy that authenticates, or null. Used before evicting the only cached copy.</summary>
    private string? VerifiedFolderCopy(string id)
    {
        var current = PlacementOrNull(); if (current is null) return null;
        foreach (var path in FolderCopies(current, id))
        {
            try { VaultCrypto.ValidatePhysicalPath(path); VerifyPart(path, id); return path; }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException or System.Security.Cryptography.CryptographicException or ArgumentException) { }
        }
        return null;
    }

    /// <summary>Copies a placed folder copy into the cache. The copy is authenticated before it replaces anything.</summary>
    private bool TryHydratePlacedFolder(string id, CancellationToken token = default)
    {
        var current = PlacementOrNull(); if (current is null) return false;
        foreach (var path in FolderCopies(current, id).ToArray())
        {
            token.ThrowIfCancellationRequested();
            var local = ObjectPath(cache, "parts", id); var temporary = local + "." + Guid.NewGuid().ToString("N") + ".placed.tmp";
            try
            {
                VaultCrypto.ValidatePhysicalPath(path);
                using (var input = File.OpenRead(path))
                {
                    if (input.Length > 1073741824 || input.Length < VaultCrypto.Overhead) throw new InvalidDataException("Invalid part size.");
                    using var output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None, 65536, FileOptions.WriteThrough);
                    input.CopyTo(output); output.Flush(true);
                }
                PublishVerifiedCachePart(temporary, id);
                return true;
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException or System.Security.Cryptography.CryptographicException or ArgumentException) { }
            finally { if (File.Exists(temporary)) File.Delete(temporary); }
        }
        return false;
    }
    private void PublishVerifiedCachePart(string temporary, string id)
    {
        VerifyPart(temporary, id);
        // Placed copies hold the same immutable ciphertext, so replacing a damaged cache copy is safe.
        File.Move(temporary, ObjectPath(cache, "parts", id), true);
    }
    private IOException PlacedUnavailable(SplitPlacement current, string id)
    {
        var labels = current.Holders(id).Select(holder => holder.Label.Length == 0 ? "another location" : holder.Label).Distinct(StringComparer.Ordinal).ToArray();
        if (labels.Length == 0) labels = ["a split storage mirror"];
        return labels.Length == 1
            ? new SplitLocationUnavailableException($"This file is stored on {labels[0]}, which is not connected.")
            : new SplitLocationUnavailableException($"This file is stored on {string.Join(" or ", labels)}, which are not connected.");
    }

    /// <summary>
    /// Hydrates one part held outside the main folder. Returns false when placement does not know the part.
    /// Throws an IOException naming the location when it is known but no copy could be reached.
    /// </summary>
    private async Task<bool> TryHydratePlacedAsync(string id, CancellationToken token)
    {
        var current = CurrentPlacement();
        if (current is null || !PlacedElsewhere(id)) return false;
        if (TryHydratePlacedFolder(id, token)) return true;
        var registries = current.Holders(id).Where(holder => holder.Kind == "registry").ToArray();
        var fetch = FetchPlacedPartAsync;
        if (registries.Length > 0 && fetch is not null)
        {
            await registryFetches.WaitAsync(token).ConfigureAwait(false);
            try
            {
                if (File.Exists(ObjectPath(cache, "parts", id))) return true;
                foreach (var location in registries)
                {
                    token.ThrowIfCancellationRequested();
                    var temporary = ObjectPath(cache, "parts", id) + "." + Guid.NewGuid().ToString("N") + ".fetch.tmp";
                    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token); timeout.CancelAfter(PlacedFetchTimeout);
                    try
                    {
                        await fetch(new PlacedPartFetch(id, location.Id, location.Label, source, temporary), timeout.Token).ConfigureAwait(false);
                        if (!File.Exists(temporary)) continue;
                        PublishVerifiedCachePart(temporary, id);
                        return true;
                    }
                    catch (OperationCanceledException) when (!token.IsCancellationRequested) { }
                    catch (Exception error) when (error is IOException or UnauthorizedAccessException or InvalidDataException or System.Security.Cryptography.CryptographicException or InvalidOperationException) { }
                    finally { if (File.Exists(temporary)) File.Delete(temporary); }
                }
            }
            finally { registryFetches.Release(); }
        }
        throw PlacedUnavailable(current, id);
    }

    /// <summary>Single hydration entry point: placed copies first, then the transport.</summary>
    private async Task HydratePartAsync(string relative, CancellationToken token)
    {
        if (relative.StartsWith("parts/", StringComparison.Ordinal) && relative.EndsWith(".mfe", StringComparison.Ordinal))
        {
            var id = ValidateId(relative[6..^4]);
            if (await TryHydratePlacedAsync(id, token).ConfigureAwait(false)) return;
        }
        var hydrate = HydrateEncryptedFileAsync ?? throw new IOException("Encrypted content is unavailable offline.");
        await hydrate(relative, token).ConfigureAwait(false);
    }

    /// <summary>
    /// Called with the namespace lock held when a part is missing from the cache and the main folder.
    /// Local folder copies are copied in place; registry copies require preparation outside locks.
    /// </summary>
    private string? EnsurePlacedPart(string id)
    {
        var current = CurrentPlacement();
        if (current is null || !PlacedElsewhere(id)) return null;
        if (TryHydratePlacedFolder(id)) return ObjectPath(cache, "parts", id);
        if (FetchPlacedPartAsync is not null && current.Holders(id).Any(holder => holder.Kind == "registry"))
            throw new VaultHydrationRequiredException(["parts/" + id + ".mfe"]);
        throw PlacedUnavailable(current, id);
    }

    /// <summary>Every part the drive references, with a size and the location a path rule pins it to.</summary>
    public IReadOnlyList<SplitInventoryPart> GetSplitInventory(IReadOnlyList<(string Match, string Location)> rules)
    {
        if (rules.Count > 100) throw new ArgumentException("Use at most 100 placement rules.");
        var compiled = rules.Select(rule => (Pattern: SplitRulePattern(rule.Match), Nested: rule.Match.Contains('/'), rule.Location)).ToArray();
        using var lifetime = AcquireStorageOperation();
        var current = new List<(string Path, Entry Entry)>(); var history = new List<(string Path, Entry Entry)>(); string[] commits;
        lock (gate)
        {
            Check();
            current.AddRange(entries.Where(p => !p.Value.Directory).Select(p => (p.Key, Clone(p.Value))));
            history.AddRange(pendingVersions.Where(v => !v.Value.Directory).Select(v => (v.Path, Clone(v.Value))));
            commits = known.ToArray();
        }
        foreach (var id in commits) history.AddRange(ReadMetadata<Commit>(ObjectPath(cache, "commits", id), "commit", id).Versions.Where(v => !v.Value.Directory).Select(v => (v.Path, v.Value)));
        var pins = new Dictionary<string, string?>(StringComparer.Ordinal);
        // Current files come first in path order, then history, so a shared part follows the first file.
        foreach (var (path, entry) in current.OrderBy(item => item.Path, StringComparer.OrdinalIgnoreCase).Concat(history.OrderBy(item => item.Path, StringComparer.OrdinalIgnoreCase)))
        {
            string? pin = null;
            foreach (var rule in compiled) if (rule.Pattern.IsMatch(path) || !rule.Nested && rule.Pattern.IsMatch(path[(path.LastIndexOf('/') + 1)..])) { pin = rule.Location; break; }
            foreach (var record in AllRecords(entry)) pins.TryAdd(record.Part, pin);
        }
        var placed = PlacementOrNull();
        long Size(string id)
        {
            foreach (var candidate in new[] { ObjectPath(cache, "parts", id), ObjectPath(source, "parts", id) }) try { if (File.Exists(candidate)) return new FileInfo(candidate).Length; } catch (IOException) { }
            return placed?.RecordedSize(id) ?? 0;
        }
        return pins.OrderBy(p => p.Key, StringComparer.Ordinal).Select(p => new SplitInventoryPart(p.Key, Size(p.Key), p.Value)).ToArray();
    }

    /// <summary>Glob over drive paths: ** crosses folders, * and ? stay within one name. Case-insensitive.</summary>
    internal static Regex SplitRulePattern(string match)
    {
        if (string.IsNullOrWhiteSpace(match) || match.Length > 256 || match.Contains('\0') || match.Contains('\\') || match.Split('/').Any(part => part is "." or "..")) throw new ArgumentException("Placement rules use folder patterns such as Projects/** or *.mp4.");
        var builder = new System.Text.StringBuilder("\\A");
        for (var i = 0; i < match.Length; i++)
        {
            var c = match[i];
            if (c == '*' && i + 1 < match.Length && match[i + 1] == '*') { builder.Append(".*"); i++; if (i + 1 < match.Length && match[i + 1] == '/') i++; }
            else if (c == '*') builder.Append("[^/]*");
            else if (c == '?') builder.Append("[^/]");
            else builder.Append(Regex.Escape(c.ToString()));
        }
        return new Regex(builder.Append("\\z").ToString(), RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromSeconds(1));
    }

    /// <summary>Current files that cannot be read while the given locations are disconnected.</summary>
    public SplitAffectedFiles GetSplitAffectedFiles(IReadOnlyCollection<string> disconnected, int limit)
    {
        limit = Math.Clamp(limit, 0, 200);
        var current = CurrentPlacement();
        if (current is null || disconnected.Count == 0) return new(0, []);
        var away = disconnected.ToHashSet(StringComparer.Ordinal);
        bool Missing(string part)
        {
            if (File.Exists(ObjectPath(cache, "parts", part)) || File.Exists(ObjectPath(source, "parts", part))) return false;
            if (current.FolderMirrors.Any(mirror => !away.Contains(mirror.Id) && SafeExists(mirror.PartPath(config.VaultId, part)))) return false;
            var holders = current.Holders(part);
            return holders.Count > 0 && holders.All(holder => away.Contains(holder.Id));
        }
        (string Path, RecordRef[] Records)[] files;
        lock (gate) { Check(); files = entries.Where(p => !p.Value.Directory).OrderBy(p => p.Key, StringComparer.OrdinalIgnoreCase).Select(p => (p.Value.StoredPath ?? p.Key, AllRecords(p.Value).ToArray())).ToArray(); }
        var affected = files.Where(file => file.Records.Any(record => Missing(record.Part))).Select(file => file.Path).ToArray();
        return new(affected.Length, affected.Take(limit).ToArray());
    }
}
