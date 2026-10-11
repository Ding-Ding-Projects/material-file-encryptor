using System.Text.RegularExpressions;

namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    public IReadOnlyList<string> GetEncryptedActivitySnapshotPaths()
    {
        lock (gate)
        {
            Check();
            return ReadAllActivityObjects().Select(item => "activity/" + item.Id + ".mfe").ToArray();
        }
    }

    private VaultActivity[] ReadAllActivityObjects()
    {
        var items = new Dictionary<string, VaultActivity>(StringComparer.Ordinal);
        foreach (var root in new[] { cache, source })
        {
            var folder = Path.Combine(root, "activity"); VaultCrypto.ValidatePhysicalPath(folder);
            if (!Directory.Exists(folder)) continue;
            foreach (var file in Directory.EnumerateFiles(folder, "*.mfe"))
            {
                var id = ValidateId(Path.GetFileNameWithoutExtension(file));
                var item = ReadActivity(file, id);
                if (items.TryGetValue(id, out var previous) && previous != item) throw new InvalidDataException("Conflicting activity object.");
                items[id] = item;
            }
        }
        return items.Values.OrderBy(item => item.Id, StringComparer.Ordinal).ToArray();
    }

    private void CopyActivityTo(VaultEngine target)
    {
        // The caller already owns both newly created engine state and this engine's lock.
        // Deserialize before writing, then re-encrypt under the destination vault domain.
        var items = ReadAllActivityObjects();
        if (items.Length == 0) return;
        foreach (var root in new[] { target.cache, target.source })
        {
            var folder = Path.Combine(root, "activity"); VaultCrypto.ValidatePhysicalPath(folder); Directory.CreateDirectory(folder);
            foreach (var item in items) target.WriteMetadata(target.ObjectPath(root, "activity", item.Id), item, "activity", item.Id);
        }
        foreach (var root in new[] { target.cache, target.source })
        foreach (var item in items)
            if (target.ReadActivity(target.ObjectPath(root, "activity", item.Id), item.Id) != item) throw new InvalidDataException("Upgraded activity verification failed.");
    }

    public VaultVersionPreview PreviewVersion(string versionId)
    {
        lock (gate)
        {
            Check(); ValidateId(versionId);
            var version = AllVersions().SingleOrDefault(v => v.Id == versionId) ?? throw new FileNotFoundException("Version not found.");
            if (version.Value.Directory || version.Value.Length > 262144) throw new IOException("Preview supports text files up to 256 KiB. Export this version instead.");
            var bytes = new byte[(int)version.Value.Length];
            try
            {
                Read(version.Value, 0, bytes);
                var text = new System.Text.UTF8Encoding(false, true).GetString(bytes);
                if (text.Any(c => char.IsControl(c) && c is not ('\r' or '\n' or '\t'))) throw new IOException("Binary content cannot be previewed. Export this version instead.");
                return new(versionId, text, version.Value.Length);
            }
            finally { System.Security.Cryptography.CryptographicOperations.ZeroMemory(bytes); }
        }
    }

    public void LabelVersion(string versionId, string label)
    {
        lock (gate)
        {
            Check(); ValidateId(versionId);
            if (label.Length > 120 || label.Any(char.IsControl)) throw new ArgumentException("Labels must contain at most 120 printable characters.");
            var version = AllVersions().SingleOrDefault(v => v.Id == versionId) ?? throw new FileNotFoundException("Version not found.");
            RecordActivity(version.Value.Id, "label", version.Path, versionId, label);
        }
    }

    public IReadOnlyDictionary<string, string> ListVersionLabels(string entryId)
    {
        lock (gate)
        {
            var labels = new Dictionary<string, string>(StringComparer.Ordinal);
            string? cursor = null;
            do
            {
                var page = ListActivity(new(EntryId: entryId, Action: "label", Cursor: cursor, Limit: 500));
                foreach (var item in page.Items) if (item.VersionId != null) labels.TryAdd(item.VersionId, item.Detail ?? "");
                cursor = page.NextCursor;
            } while (cursor != null);
            return labels;
        }
    }

    private static readonly HashSet<string> ActivityActions = ["import", "edit", "rename", "restore", "cancel", "sync", "delete", "create", "export", "label"];
    public VaultActivity RecordActivity(string entryId, string action, string? path = null, string? versionId = null, string? detail = null)
    {
        lock (gate)
        {
            Check(); ValidateId(entryId);
            if (!ActivityActions.Contains(action)) throw new ArgumentException("Unsupported activity action.", nameof(action));
            if (versionId != null) ValidateId(versionId);
            if (path != null)
            {
                if (Path.IsPathRooted(path) || path.StartsWith('/') || path.StartsWith('\\')) throw new ArgumentException("Activity paths must be vault-relative.", nameof(path));
                path = VaultPath.Normalize(path);
            }
            if (detail?.Length > 512 || detail?.Any(char.IsControl) == true) throw new ArgumentException("Invalid activity detail.", nameof(detail));
            var item = new VaultActivity(Guid.NewGuid().ToString("N"), entryId, action, DateTimeOffset.UtcNow, path, versionId, detail);
            var folder = Path.Combine(cache, "activity"); VaultCrypto.ValidatePhysicalPath(folder); Directory.CreateDirectory(folder);
            WriteMetadata(ObjectPath(cache, "activity", item.Id), item, "activity", item.Id);
            SynchronizeActivity();
            return item;
        }
    }

    /// <summary>Merge immutable authenticated activity objects without trusting a filename as evidence.</summary>
    public void SynchronizeActivity()
    {
        lock (gate)
        {
            Check();
            if (!Directory.Exists(source)) return;
            foreach (var root in new[] { cache, source })
            {
                var folder = Path.Combine(root, "activity"); VaultCrypto.ValidatePhysicalPath(folder); Directory.CreateDirectory(folder);
            }
            foreach (var (from, to) in new[] { (source, cache), (cache, source) })
            foreach (var file in Directory.EnumerateFiles(Path.Combine(from, "activity"), "*.mfe"))
            {
                var id = ValidateId(Path.GetFileNameWithoutExtension(file));
                var item = ReadActivity(file, id);
                var destination = ObjectPath(to, "activity", id);
                if (File.Exists(destination))
                {
                    if (ReadActivity(destination, id) != item) throw new InvalidDataException("Conflicting activity object.");
                }
                else WriteMetadata(destination, item, "activity", id);
            }
        }
    }

    private VaultActivity ReadActivity(string file, string id)
    {
        var item = ReadMetadata<VaultActivity>(file, "activity", id);
        if (item.Id != id || !ActivityActions.Contains(item.Action) || item.Detail?.Length > 512 || item.Detail?.Any(char.IsControl) == true) throw new InvalidDataException("Invalid activity object.");
        ValidateId(item.EntryId); if (item.VersionId != null) ValidateId(item.VersionId);
        if (item.Path != null && item.Path != VaultPath.Normalize(item.Path)) throw new InvalidDataException("Invalid activity path.");
        return item;
    }

    public VaultActivityPage ListActivity(VaultActivityQuery? query = null)
    {
        lock (gate)
        {
            Check(); query ??= new();
            if (query.Limit is < 1 or > 500) throw new ArgumentOutOfRangeException(nameof(query.Limit));
            if (query.EntryId != null) ValidateId(query.EntryId);
            if (query.Action != null && !ActivityActions.Contains(query.Action)) throw new ArgumentException("Unsupported activity action.");
            if (query.FromUtc > query.ToUtc) throw new ArgumentException("Invalid date range.");
            Regex? regex = query.Pattern == null ? null : new(query.Pattern, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100));
            var folder = Path.Combine(cache, "activity"); VaultCrypto.ValidatePhysicalPath(folder);
            var all = Directory.Exists(folder) ? Directory.EnumerateFiles(folder, "*.mfe").Select(file => ReadActivity(file, ValidateId(Path.GetFileNameWithoutExtension(file)))).OrderByDescending(x => x.TimestampUtc).ThenByDescending(x => x.Id, StringComparer.Ordinal).ToArray() : [];
            IEnumerable<VaultActivity> rows = all;
            if (query.Cursor != null)
            {
                var index = Array.FindIndex(all, x => x.Id == query.Cursor);
                if (index < 0) throw new ArgumentException("Activity cursor has expired or is invalid.");
                rows = all.Skip(index + 1);
            }
            var selected = rows.Where(x => (query.EntryId == null || x.EntryId == query.EntryId) && (query.Action == null || x.Action == query.Action) && (query.FromUtc == null || x.TimestampUtc >= query.FromUtc) && (query.ToUtc == null || x.TimestampUtc <= query.ToUtc) && (regex == null || regex.IsMatch((x.Path ?? "") + " " + (x.Detail ?? "") + " " + x.Action))).Take(query.Limit + 1).ToArray();
            return new(selected.Take(query.Limit).ToArray(), selected.Length > query.Limit ? selected[query.Limit - 1].Id : null);
        }
    }
}
