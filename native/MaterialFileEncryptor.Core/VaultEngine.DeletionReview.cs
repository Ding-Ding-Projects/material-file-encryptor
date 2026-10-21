namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    private sealed record DeletionCandidate(string OriginId, VaultDeletionIntent Intent, VaultConflictEntry? Current)
    {
        public string Id => ReviewHash("delete-review\n" + Intent.DeletionCommitId + "\n" + Intent.EntryId + "\n" + Current?.EntryId + "\n" + Current?.VersionId + "\n" + Current?.Path);
    }
    private static void ValidateDeletionResolution(DeletionResolution item)
    {
        ValidateId(item.ConflictId); ValidateId(item.CurrentEntryId); ValidateId(item.CurrentVersion); ValidateId(item.CurrentHistoryVersionId);
        ValidateId(item.Deletion.DeletionCommitId); ValidateId(item.Deletion.EntryId); ValidateId(item.Deletion.ExpectedVersion);
        if(item.Choice is not ("keep-change" or "apply-deletion"))throw new InvalidDataException("Invalid deletion review choice.");
        if(item.Deletion.Path!=VaultPath.Normalize(item.Deletion.Path)||item.CurrentPath!=VaultPath.Normalize(item.CurrentPath))throw new InvalidDataException("Invalid deletion review path.");
    }
    private static List<DeletionCandidate> DeletionCandidates(IReadOnlyDictionary<string, Commit> commits, IEnumerable<ReplayConflict> origins, Dictionary<string, Entry> state)
    {
        var result=new List<DeletionCandidate>();
        foreach(var origin in origins.Where(item=>item.Kind=="delete-versus-edit"))
        {
            string? liveId=origin.CurrentId??origin.PreservedId;
            if(liveId is null||!commits.TryGetValue(origin.CommitId,out var incoming))continue;
            foreach(var deletion in commits.Values)
            {
                var removed=deletion.Versions.FirstOrDefault(item=>item.Deleted&&!item.Value.Directory&&item.Value.Id==liveId&&item.Path.Equals(origin.Path,StringComparison.OrdinalIgnoreCase));
                if(removed is null||deletion.Changes.Any(item=>item.Value?.Id==removed.Value.Id))continue;
                var change=deletion.Changes.FirstOrDefault(item=>item.Value is null&&item.Path.Equals(removed.Path,StringComparison.OrdinalIgnoreCase)&&item.ExpectedVersion==removed.Value.Version);
                if(change is null)continue;
                if(deletion.Id!=incoming.Id&&(Ancestors(incoming.Parents,commits).Contains(deletion.Id)||Ancestors(deletion.Parents,commits).Contains(incoming.Id)))continue;
                var live=state.FirstOrDefault(pair=>pair.Value.Id==liveId);
                if(live.Value?.Directory==true)continue;
                var info=live.Value is null?null:new VaultConflictEntry(live.Value.Id,live.Key,live.Value.Version,false);
                result.Add(new(origin.Id,new(deletion.Id,removed.Path,removed.Value.Id,change.ExpectedVersion!),info));
            }
        }
        return result;
    }
    private (HashSet<string> Origins,List<VaultConflictInfo> Rows) BuildDeletionReviews(Dictionary<string,Commit> commits,List<Commit> ordered,List<ReplayConflict> detected,Dictionary<string,Entry> state)
    {
        var valid=new List<(Commit Commit,DeletionResolution Receipt)>();
        foreach(var commit in ordered.Where(item=>item.DeletionResolutions.Count>0))
        {
            var ancestors=Ancestors(commit.Parents,commits);var before=new Dictionary<string,Entry>(StringComparer.OrdinalIgnoreCase);var conflicts=new List<ReplayConflict>();
            foreach(var parent in ordered.Where(item=>ancestors.Contains(item.Id)))Apply(parent,before,conflicts);
            var candidates=DeletionCandidates(commits.Where(pair=>ancestors.Contains(pair.Key)).ToDictionary(),conflicts,before);
            foreach(var receipt in commit.DeletionResolutions)
            {
                ValidateDeletionResolution(receipt);
                var candidate=candidates.FirstOrDefault(item=>item.Id==receipt.ConflictId&&item.Intent==receipt.Deletion&&item.Current?.EntryId==receipt.CurrentEntryId&&item.Current.Path==receipt.CurrentPath&&item.Current.VersionId==receipt.CurrentVersion);
                if(candidate is null||valid.Any(item=>item.Receipt.ConflictId==receipt.ConflictId&&ancestors.Contains(item.Commit.Id)))continue;
                if(!MatchesReviewedHistory(commit.Versions.SingleOrDefault(item=>item.Id==receipt.CurrentHistoryVersionId),receipt.CurrentPath,receipt.CurrentEntryId,receipt.CurrentVersion))continue;
                if(commit.Changes.Count!=1||commit.Changes[0].Path!=receipt.CurrentPath||commit.Changes[0].ExpectedVersion!=receipt.CurrentVersion)continue;
                var after=CloneEntries(before);Apply(commit,after);
                bool effect=receipt.Choice=="keep-change"?after.TryGetValue(receipt.CurrentPath,out var retained)&&retained.Id==receipt.CurrentEntryId&&retained.Version!=receipt.CurrentVersion&&SameContent(retained,before[receipt.CurrentPath]):!after.Values.Any(item=>item.Id==receipt.CurrentEntryId);
                if(effect)valid.Add((commit,receipt));
            }
        }
        var origins=new HashSet<string>();var rows=new List<VaultConflictInfo>();
        foreach(var candidate in DeletionCandidates(commits,detected,state))
        {
            var related=valid.Where(item=>item.Receipt.Deletion==candidate.Intent&&item.Receipt.CurrentEntryId==(candidate.Current?.EntryId??candidate.Intent.EntryId)).ToArray();
            if(candidate.Current is null)
            {
                if(related.Any(item=>item.Receipt.Choice=="apply-deletion"))origins.Add(candidate.OriginId);
                continue;
            }
            origins.Add(candidate.OriginId);
            var producer=ordered.LastOrDefault(item=>item.Changes.Any(change=>change.Value?.Id==candidate.Current.EntryId&&change.Value.Version==candidate.Current.VersionId));
            var observed=producer is null?known:Ancestors(producer.Parents,commits);
            if(related.Any(item=>item.Receipt.ConflictId==candidate.Id||producer?.Id==item.Commit.Id||observed.Contains(item.Commit.Id)))continue;
            rows.Add(new(candidate.Id,"delete-versus-edit",candidate.Current,null,["keep-change","apply-deletion"],null,candidate.Intent));
        }
        return (origins,rows.DistinctBy(item=>item.ConflictId).ToList());
    }
    private VaultConflictResult ResolveDeletionConflict(string conflictId,string choice,string currentVersion,string? preservedVersion,string? deletionCommitId)
    {
        if(preservedVersion is not null||deletionCommitId is null)throw new ArgumentException("Deletion review requires its separate deletion transaction identifier.");
        ValidateId(deletionCommitId);
        var selected=ConflictIndex().Select(item=>item.Info).SingleOrDefault(item=>item.ConflictId==conflictId);
        if(selected is null)throw new InvalidOperationException("This conflict review is stale. Refresh the conflict list.");
        if(selected.Kind!="delete-versus-edit"||selected.Deletion?.DeletionCommitId!=deletionCommitId||selected.Current is null||!selected.SupportedChoices.Contains(choice))throw new InvalidOperationException("Select the exact reviewed file deletion and supported choice.");
        var current=selected.Current;
        if(current.VersionId!=currentVersion)throw new InvalidOperationException("The file versions changed. Refresh the conflict list before choosing.");
        if(Find(current.Path).Directory||entries.Keys.Any(path=>path.StartsWith(current.Path+"/",StringComparison.OrdinalIgnoreCase)))throw new InvalidOperationException("Directory deletion requires a separate subtree review.");
        FlushLocal();
        var oldEntries=new Dictionary<string,Entry>(entries,StringComparer.OrdinalIgnoreCase);var oldVersions=pendingVersions.ToList();
        var oldDue=new Dictionary<string,DateTimeOffset>(versionDue);var oldPacking=new Dictionary<string,long>(packingQueue);var oldOrphans=new Dictionary<string,Entry>(orphans);
        int mutations=journalMutations.Count,knownCount=known.Count;long oldRevision=revision;
        try
        {
            CaptureVersion(current.Path,Find(current.Path),false);string history=pendingVersions[^1].Id;
            if(choice=="apply-deletion")Remove(current.Path);
            else {var retained=Clone(Find(current.Path));Touch(retained);SetEntry(current.Path,retained);MarkDue(retained);}
            FlushLocal(deletionResolutions:[new(conflictId,choice,selected.Deletion,current.EntryId,current.Path,currentVersion,history)]);
            return new(conflictId,choice,true);
        }
        catch
        {
            if(known.Count==knownCount){AdoptEntries(oldEntries);pendingVersions=oldVersions;versionDue=oldDue;packingQueue=oldPacking;orphans.Clear();foreach(var pair in oldOrphans)orphans.Add(pair.Key,pair.Value);journalMutations.RemoveRange(mutations,journalMutations.Count-mutations);revision=oldRevision;}
            throw;
        }
    }
}
