namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    private static void ValidateRecovery(ConflictRecovery item)
    {
        foreach(var id in new[]{item.ConflictId,item.FirstResolutionCommitId,item.SecondResolutionCommitId,item.CurrentHistoryVersionId,item.PreservedHistoryVersionId,item.CurrentVersion,item.PreservedVersion})ValidateId(id);
        if(item.RestoredPaths.Count!=2||item.RestoredEntryIds.Count!=2||item.RestoredPaths.Distinct(StringComparer.OrdinalIgnoreCase).Count()!=2||item.RestoredEntryIds.Distinct().Count()!=2)throw new InvalidDataException("Invalid conflict recovery output.");
        foreach(var id in item.RestoredEntryIds)ValidateId(id);
        foreach(var path in item.RestoredPaths)if(path!=VaultPath.Normalize(path))throw new InvalidDataException("Invalid recovery path.");
    }
    private static bool IsRecovered(string conflictId,ValidatedResolution first,ValidatedResolution second,Dictionary<string,Commit> commits,List<Commit> ordered)
    {
        foreach(var commit in ordered.Where(item=>item.ConflictRecoveries.Count>0))
        {
            var ancestors=Ancestors(commit.Parents,commits);
            if(!ancestors.Contains(first.Commit.Id)||!ancestors.Contains(second.Commit.Id))continue;
            foreach(var receipt in commit.ConflictRecoveries.Where(item=>item.ConflictId==conflictId))
            {
                ValidateRecovery(receipt);
                if(commit.Changes.Count!=2)continue;
                if(receipt.FirstResolutionCommitId!=first.Commit.Id||receipt.SecondResolutionCommitId!=second.Commit.Id
                    ||receipt.CurrentHistoryVersionId!=first.Current.Id||receipt.PreservedHistoryVersionId!=second.Preserved.Id
                    ||receipt.CurrentVersion!=first.Current.Value.Version||receipt.PreservedVersion!=second.Preserved.Value.Version)continue;
                var before=new Dictionary<string,Entry>(StringComparer.OrdinalIgnoreCase);
                foreach(var parent in ordered.Where(item=>ancestors.Contains(item.Id)))Apply(parent,before);
                var versions=new[]{first.Current,second.Preserved};bool valid=true;
                for(int index=0;index<2;index++)
                {
                    string path=receipt.RestoredPaths[index];
                    var change=commit.Changes.SingleOrDefault(item=>item.Path==path);
                    if(path.Contains('/')||before.ContainsKey(path)||change?.ExpectedVersion is not null||change?.Value is null||change.Value.Id!=receipt.RestoredEntryIds[index]
                        ||before.Values.Any(item=>item.Id==change.Value.Id)||!SameContent(change.Value,versions[index].Value))valid=false;
                }
                if(valid)return true;
            }
        }
        return false;
    }
    private VaultConflictResult RecoverDivergence(VaultConflictInfo selected,string choice,string currentVersion,string? preservedVersion)
    {
        if(choice!="keep-both")throw new InvalidOperationException("Divergent decisions require preserving both reviewed versions under new names.");
        if(selected.Current is null||selected.Preserved is null||selected.Current.VersionId!=currentVersion||selected.Preserved.VersionId!=preservedVersion)throw new InvalidOperationException("The file versions changed. Refresh the conflict list before choosing.");
        var all=AllVersions();var current=all.Single(item=>item.Id==selected.Current.HistoryVersionId);var preserved=all.Single(item=>item.Id==selected.Preserved.HistoryVersionId);
        foreach(var version in new[]{current,preserved})
        {
            foreach(var record in AllRecords(version.Value))VerifyRecord(record,Math.Max(version.Value.ChunkSize,version.Value.OverlaySize));
        }
        var commits=known.Select(id=>ReadMetadata<Commit>(ObjectPath(cache,"commits",id),"commit",id)).ToArray();
        string first=commits.Single(item=>item.ConflictResolutions.Any(receipt=>receipt.CurrentHistoryVersionId==current.Id)).Id;
        string second=commits.Single(item=>item.ConflictResolutions.Any(receipt=>receipt.PreservedHistoryVersionId==preserved.Id)).Id;
        FlushLocal();
        var oldEntries=new Dictionary<string,Entry>(entries,StringComparer.OrdinalIgnoreCase);var oldVersions=pendingVersions.ToList();var oldDue=new Dictionary<string,DateTimeOffset>(versionDue);
        int knownCount=known.Count;long oldRevision=revision;
        try
        {
            var paths=new List<string>();var ids=new List<string>();
            foreach(var version in new[]{current,preserved})
            {
                // The advertised recovery destination is the vault root. Historical
                // ancestors may have been moved, deleted, or replaced by a file.
                string path=ConflictPath(Name(version.Path),Guid.NewGuid().ToString("N"),entries);
                var entry=Clone(version.Value);entry.Id=Guid.NewGuid().ToString("N");Touch(entry);AddEntry(path,entry);MarkDue(entry);
                CaptureVersion(path,entry,false);paths.Add(path);ids.Add(entry.Id);
            }
            FlushLocal(recoveries:[new(selected.ConflictId,first,second,current.Id,preserved.Id,currentVersion,preservedVersion!,paths,ids)]);
            return new(selected.ConflictId,choice,true,paths);
        }
        catch
        {
            if(known.Count==knownCount){AdoptEntries(oldEntries);pendingVersions=oldVersions;versionDue=oldDue;revision=oldRevision;}
            throw;
        }
    }
}
