using System.Security.Cryptography;
using System.Text;

namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    private sealed record ReplayConflict(string Id, string Kind, string? CurrentId, string? PreservedId, string CommitId = "", string Path = "");
    private static readonly string[] ConflictChoices = ["keep-current", "use-preserved", "keep-both"];
    internal Func<string>? ConflictCommitIdFactory { get; set; }

    private static string ReviewHash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
    private static ReplayConflict NewReplayConflict(Commit commit, Change change, Entry? current, Entry? preserved, string kind) =>
        new(ReviewHash(commit.Id + "\n" + change.Path + "\n" + current?.Id + "\n" + current?.Version + "\n" + preserved?.Id + "\n" + preserved?.Version),
            kind, current?.Id, preserved?.Id, commit.Id, change.Path);

    private static void ValidateResolution(ConflictResolution resolution)
    {
        ValidateId(resolution.ConflictId); ValidateId(resolution.CurrentVersion); ValidateId(resolution.PreservedVersion);
        if (!ConflictChoices.Contains(resolution.Choice, StringComparer.Ordinal)) throw new InvalidDataException("Invalid conflict review choice.");
        foreach (var id in new[] { resolution.CurrentEntryId, resolution.PreservedEntryId, resolution.CurrentHistoryVersionId, resolution.PreservedHistoryVersionId })
            if (id is not null) ValidateId(id);
    }

    // Reuse the actual replay algorithm. Names are presentation only, never evidence
    // that an entry is a conflict. This also reconstructs provenance after reopening.
    private List<(ReplayConflict Origin, VaultConflictInfo Info)> ConflictIndex()
    {
        var commits = known.ToDictionary(id => id, id => ReadMetadata<Commit>(ObjectPath(cache, "commits", id), "commit", id));
        var remaining = new Dictionary<string, Commit>(commits);
        var applied = new HashSet<string>(StringComparer.Ordinal);
        var replayed = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
        var detected = new List<ReplayConflict>();
        var ordered = new List<Commit>();
        while (remaining.Count > 0)
        {
            var ready = remaining.Values.Where(commit => commit.Parents.All(applied.Contains)).OrderBy(commit => commit.Id, StringComparer.Ordinal).ToArray();
            if (ready.Length == 0) throw new InvalidDataException("Conflict review requires complete ancestry.");
            foreach (var commit in ready)
            {
                foreach (var resolution in commit.ConflictResolutions) ValidateResolution(resolution);
                Apply(commit, replayed, detected); applied.Add(commit.Id); remaining.Remove(commit.Id);
                ordered.Add(commit);
            }
        }
        var accepted = new List<ValidatedResolution>();
        foreach (var commit in ordered.Where(item => item.ConflictResolutions.Count > 0))
        {
            var ancestors = Ancestors(commit.Parents, commits);
            var parentEntries = new Dictionary<string, Entry>(StringComparer.OrdinalIgnoreCase);
            var parentConflicts = new List<ReplayConflict>();
            foreach (var ancestor in ordered.Where(item => ancestors.Contains(item.Id))) Apply(ancestor, parentEntries, parentConflicts);
            foreach (var resolution in commit.ConflictResolutions)
            {
                // A matching identifier is not evidence of an observed conflict.
                // Validate the exact live pair against this transaction's own causal
                // parent closure, plus its two immutable history snapshots.
                var origin = parentConflicts.FirstOrDefault(item => item.Id == resolution.ConflictId);
                if (origin is null || origin.Kind is not ("file-edit" or "rename") || origin.CurrentId != resolution.CurrentEntryId || origin.PreservedId != resolution.PreservedEntryId) continue;
                if (accepted.Any(item => item.Resolution.ConflictId == resolution.ConflictId && ancestors.Contains(item.Commit.Id))) continue;
                if (!MatchesReviewedEntry(parentEntries, resolution.CurrentPath, resolution.CurrentEntryId, resolution.CurrentVersion)
                    || !MatchesReviewedEntry(parentEntries, resolution.PreservedPath, resolution.PreservedEntryId, resolution.PreservedVersion)) continue;
                var currentHistory = commit.Versions.SingleOrDefault(item => item.Id == resolution.CurrentHistoryVersionId);
                var preservedHistory = commit.Versions.SingleOrDefault(item => item.Id == resolution.PreservedHistoryVersionId);
                if (!MatchesReviewedHistory(currentHistory, resolution.CurrentPath, resolution.CurrentEntryId, resolution.CurrentVersion)
                    || !MatchesReviewedHistory(preservedHistory, resolution.PreservedPath, resolution.PreservedEntryId, resolution.PreservedVersion)) continue;
                var after = CloneEntries(parentEntries); Apply(commit, after);
                if (!ResolutionEffectMatches(origin.Kind, resolution, parentEntries, after, commit)) continue;
                accepted.Add(new(commit, resolution, ancestors, currentHistory!, preservedHistory!));
            }
        }
        var reviewed = accepted.Select(item => item.Resolution.ConflictId).ToHashSet(StringComparer.Ordinal);
        var live = entries.ToDictionary(pair => pair.Value.Id, pair => new VaultConflictEntry(pair.Value.Id, pair.Key, pair.Value.Version, pair.Value.Directory));
        var result = new List<(ReplayConflict, VaultConflictInfo)>();
        var deletionRows = BuildDeletionReviews(commits, ordered, detected, entries);
        foreach (var conflict in detected.DistinctBy(item => item.Id).Where(item => !reviewed.Contains(item.Id) && !deletionRows.Origins.Contains(item.Id)))
        {
            var current = conflict.CurrentId is null ? null : live.GetValueOrDefault(conflict.CurrentId);
            var preserved = conflict.PreservedId is null ? null : live.GetValueOrDefault(conflict.PreservedId);
            string? unsupported = conflict.Kind is not ("file-edit" or "rename") ? "This conflict category requires an explicit recovery workflow and is not resolved by file-content choices."
                : current is null || preserved is null ? "A reviewed entry is no longer live. Inspect history and refresh synchronization before recovery."
                : current.IsDirectory || preserved.IsDirectory ? "Directory conflicts require a subtree recovery workflow." : null;
            // Include current names as well as versions: rename does not change the
            // core content version, but must invalidate an already displayed review.
            string reviewId = ReviewHash(conflict.Id + "\n" + current?.Path + "\n" + preserved?.Path);
            result.Add((conflict, new(reviewId, conflict.Kind, current, preserved, unsupported is null ? ConflictChoices.ToArray() : [], unsupported)));
        }
        result.AddRange(deletionRows.Rows.Select(row => (new ReplayConflict(row.ConflictId, row.Kind, row.Current?.EntryId, null), row)));
        foreach (var group in accepted.GroupBy(item => item.Resolution.ConflictId))
        {
            var decisions = group.OrderBy(item => item.Commit.Id, StringComparer.Ordinal).ToArray();
            for (int i = 0; i < decisions.Length; i++) for (int j = i + 1; j < decisions.Length; j++)
            {
                var first = decisions[i]; var second = decisions[j];
                if (first.Ancestors.Contains(second.Commit.Id) || second.Ancestors.Contains(first.Commit.Id)) continue;
                if (first.Resolution.Choice == second.Resolution.Choice && first.Resolution.CurrentVersion == second.Resolution.CurrentVersion
                    && first.Resolution.PreservedVersion == second.Resolution.PreservedVersion) continue;
                string id = ReviewHash("divergent-review\n" + first.Commit.Id + "\n" + second.Commit.Id);
                // Both reviewed values remain directly addressable even when normal
                // namespace replay accepted the content replacement of one decision.
                var current = HistoricalConflictEntry(first.Current);
                var preserved = HistoricalConflictEntry(second.Preserved);
                if(IsRecovered(id,first,second,commits,ordered))continue;
                result.Add((new(id, "resolution-divergence", current.EntryId, preserved.EntryId),
                    new(id, "resolution-divergence", current, preserved, ["keep-both"], null, RecoveryDirectory: "")));
            }
        }
        return result.OrderBy(item => item.Item2.ConflictId, StringComparer.Ordinal).ToList();
    }

    private sealed record ValidatedResolution(Commit Commit, ConflictResolution Resolution, HashSet<string> Ancestors, StoredVersion Current, StoredVersion Preserved);
    private static HashSet<string> Ancestors(IEnumerable<string> roots, IReadOnlyDictionary<string, Commit> commits)
    {
        var result = new HashSet<string>(StringComparer.Ordinal); var pending = new Stack<string>(roots);
        while (pending.TryPop(out var id))
        {
            if (!result.Add(id)) continue;
            if (!commits.TryGetValue(id, out var commit)) throw new InvalidDataException("Conflict review ancestry is incomplete.");
            foreach (var parent in commit.Parents) pending.Push(parent);
        }
        return result;
    }
    private static bool MatchesReviewedEntry(Dictionary<string, Entry> entries, string? path, string? id, string version) =>
        path is not null && id is not null && entries.TryGetValue(path, out var entry) && entry.Id == id && entry.Version == version && !entry.Directory;
    private static bool MatchesReviewedHistory(StoredVersion? history, string? path, string? id, string version) =>
        history is not null && !history.Deleted && history.Path == path && history.Value.Id == id && history.Value.Version == version && !history.Value.Directory;
    private static VaultConflictEntry HistoricalConflictEntry(StoredVersion version) =>
        new(version.Value.Id, version.Path, version.Value.Version, version.Value.Directory, version.Id, false);

    private static bool SameContent(Entry a, Entry b) => a.Directory == b.Directory && a.Length == b.Length && a.ChunkSize == b.ChunkSize
        && a.OverlaySize == b.OverlaySize && a.BaseLength == b.BaseLength && a.Records.Count == b.Records.Count && a.Overlays.Count == b.Overlays.Count
        && a.Records.All(pair => b.Records.TryGetValue(pair.Key, out var value) && value == pair.Value)
        && a.Overlays.All(pair => b.Overlays.TryGetValue(pair.Key, out var value) && value == pair.Value);
    private static bool ResolutionEffectMatches(string kind, ConflictResolution resolution, Dictionary<string, Entry> before, Dictionary<string, Entry> after, Commit commit)
    {
        string currentPath = resolution.CurrentPath!, preservedPath = resolution.PreservedPath!;
        var current = before[currentPath]; var preserved = before[preservedPath];
        if (resolution.Choice == "keep-both") return commit.Changes.Count==0 && MatchesReviewedEntry(after, currentPath, current.Id, current.Version)
            && MatchesReviewedEntry(after, preservedPath, preserved.Id, preserved.Version) && SameContent(after[currentPath],current) && SameContent(after[preservedPath],preserved);
        if (resolution.Choice == "keep-current") return commit.Changes.Count==1 && commit.Changes[0].Path==preservedPath
            && MatchesReviewedEntry(after, currentPath, current.Id, current.Version) && SameContent(after[currentPath],current)
            && !after.Values.Any(item => item.Id == preserved.Id);
        string selectedPath = kind == "rename" ? preservedPath : currentPath;
        return commit.Changes.Count==2 && commit.Changes.All(item=>item.Path==currentPath||item.Path==preservedPath)
            && after.TryGetValue(selectedPath, out var selected) && selected.Id == current.Id && SameContent(selected, preserved)
            && !after.Values.Any(item => item.Id == preserved.Id)
            && (kind != "rename" || !after.ContainsKey(currentPath));
    }

    public VaultConflictPage ListConflicts(int limit = 100, string? cursor = null)
    {
        lock (gate)
        {
            Check();
            if (limit is < 1 or > 1000) throw new ArgumentOutOfRangeException(nameof(limit), "Choose a page size between one and 1000.");
            if (cursor is not null) ValidateId(cursor);
            var matches = ConflictIndex().Select(item => item.Info).Where(item => cursor is null || string.CompareOrdinal(item.ConflictId, cursor) > 0).Take(limit + 1).ToArray();
            return new(matches.Take(limit).ToArray(), matches.Length > limit ? matches[limit - 1].ConflictId : null);
        }
    }

    public VaultConflictResult ResolveConflict(string conflictId, string choice, string currentVersion, string? preservedVersion, string? deletionCommitId = null)
    {
        lock (gate)
        {
            Check(); ValidateId(conflictId); ValidateId(currentVersion); if(preservedVersion is not null)ValidateId(preservedVersion);
            if (choice is "keep-change" or "apply-deletion") return ResolveDeletionConflict(conflictId, choice, currentVersion, preservedVersion, deletionCommitId);
            if (!ConflictChoices.Contains(choice, StringComparer.Ordinal)) throw new ArgumentException("Choose a supported conflict review action.");
            var selected = ConflictIndex().SingleOrDefault(item => item.Info.ConflictId == conflictId);
            if (selected.Info is null) throw new InvalidOperationException("This conflict review is stale. Refresh the conflict list.");
            if(selected.Info.Kind=="resolution-divergence")return RecoverDivergence(selected.Info,choice,currentVersion,preservedVersion);
            if (selected.Info.UnsupportedReason is not null) throw new InvalidOperationException(selected.Info.UnsupportedReason);
            var current = selected.Info.Current!; var preserved = selected.Info.Preserved!;
            if (current.VersionId != currentVersion || preserved.VersionId != preservedVersion)
                throw new InvalidOperationException("The file versions changed. Refresh the conflict list before choosing.");

            // Persist unrelated pending edits before taking the rollback snapshot.
            // All validation above and the transaction below share the namespace lock.
            FlushLocal();
            var oldEntries = new Dictionary<string, Entry>(entries, StringComparer.OrdinalIgnoreCase);
            var oldVersions = pendingVersions.ToList(); var oldDue = new Dictionary<string, DateTimeOffset>(versionDue);
            var oldPacking = new Dictionary<string, long>(packingQueue); var oldOrphans = new Dictionary<string, Entry>(orphans);
            int mutationCount = journalMutations.Count, knownCount = known.Count; long oldRevision = revision;
            try
            {
                CaptureVersion(current.Path, Find(current.Path), false);
                string currentHistory = pendingVersions[^1].Id;
                CaptureVersion(preserved.Path, Find(preserved.Path), false);
                string preservedHistory = pendingVersions[^1].Id;
                if (choice == "use-preserved")
                {
                    var named = Find(current.Path); var alternate = Find(preserved.Path);
                    var replacement = Clone(alternate); replacement.Id = named.Id; replacement.Created = named.Created;
                    Touch(replacement);
                    if (selected.Origin.Kind == "rename")
                    {
                        // Both exact paths and identities were reviewed under this lock.
                        // Remove the alternate first, then move the retained identity.
                        Remove(preserved.Path); entries.Remove(current.Path);
                        SetEntry(preserved.Path, replacement);
                    }
                    else SetEntry(current.Path, replacement);
                    MarkDue(replacement);
                    packingQueue.Remove(named.Id);
                }
                if (choice != "keep-both" && !(choice == "use-preserved" && selected.Origin.Kind == "rename")) Remove(preserved.Path);
                FlushLocal([new(selected.Origin.Id, currentVersion, preservedVersion!, choice,
                    current.EntryId, preserved.EntryId, current.Path, preserved.Path, currentHistory, preservedHistory)]);
                return new(conflictId, choice, true);
            }
            catch
            {
                // Once adopted, the immutable transaction is durable. A later journal
                // failure must not roll back its namespace and then publish a reversal.
                if (known.Count == knownCount)
                {
                    AdoptEntries(oldEntries); pendingVersions = oldVersions; versionDue = oldDue; packingQueue = oldPacking;
                    orphans.Clear(); foreach (var pair in oldOrphans) orphans.Add(pair.Key, pair.Value);
                    journalMutations.RemoveRange(mutationCount, journalMutations.Count - mutationCount); revision = oldRevision;
                }
                throw;
            }
        }
    }
}
