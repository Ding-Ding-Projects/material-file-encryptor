using System.Text;
using System.Reflection;
using MaterialFileEncryptor.Core;

internal static class ConflictReviewTests
{
    private sealed class Fixture : IDisposable
    {
        internal readonly string Root = Path.Combine(Path.GetTempPath(), "mfe-conflict-review-" + Guid.NewGuid().ToString("N"));
        internal readonly VaultCredentials Credential = VaultCredentials.KeyFile(Enumerable.Range(0, 32).Select(i => (byte)i).ToArray());
        internal VaultEngine A, B;
        internal VaultOptions Options(string cache) => new() { StorageRoot = Path.Combine(Root, "source"), CacheRoot = Path.Combine(Root, cache), PartSizeBytes = 4096 };
        internal Fixture()
        {
            A = VaultEngine.Create(Options("a"), Credential);
            A.CreateFile("shared"); A.WriteRange("shared", 0, "base"u8); A.FlushAsync().GetAwaiter().GetResult();
            B = VaultEngine.Open(Options("b"), Credential);
        }
        internal void Conflict()
        {
            A.WriteRange("shared", 0, "AAAA"u8); B.WriteRange("shared", 0, "BBBB"u8);
            A.FlushAsync().GetAwaiter().GetResult(); B.FlushAsync().GetAwaiter().GetResult(); Sync();
        }
        internal void Sync() { A.SyncAsync().GetAwaiter().GetResult(); B.SyncAsync().GetAwaiter().GetResult(); }
        public void Dispose() { A.Dispose(); B.Dispose(); Credential.Dispose(); if (Directory.Exists(Root)) Directory.Delete(Root, true); }
    }
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
    private static string Read(VaultEngine engine, string path)
    { var buffer = new byte[checked((int)engine.GetInfo(path)!.Length)]; engine.ReadRange(path, 0, buffer); return Encoding.UTF8.GetString(buffer); }
    private static HashSet<string> Content(VaultEngine engine) => engine.Enumerate("").Where(e => !e.IsDirectory).Select(e => Read(engine, e.Path))
        .Concat(engine.ListVersions().Where(v => !v.IsDirectory && v.IsAvailable).Select(v => engine.PreviewVersion(v.Id).Text)).ToHashSet();
    private static VaultConflictInfo Only(VaultEngine engine) => engine.ListConflicts().Items.Single(item => item.Kind == "file-edit" && item.UnsupportedReason is null);
    private static void Resolve(VaultEngine engine, VaultConflictInfo item, string choice) =>
        engine.ResolveConflict(item.ConflictId, choice, item.Current!.VersionId, item.Preserved!.VersionId);
    private static void Rejected(Action action)
    { try { action(); } catch (InvalidOperationException) { return; } throw new Exception("Stale review was accepted."); }

    internal static void Choices()
    {
        foreach (string choice in new[] { "keep-current", "use-preserved", "keep-both" })
        {
            using var f = new Fixture(); f.Conflict(); var conflict = Only(f.A);
            string originalId = conflict.Current!.EntryId, original = Read(f.A, conflict.Current.Path), alternate = Read(f.A, conflict.Preserved!.Path);
            Resolve(f.A, conflict, choice);
            Require(f.A.ListConflicts().Items.Count == 0, "Resolved conflict remained pending.");
            Require(f.A.GetInfo(conflict.Current.Path)!.EntryId == originalId, "Named entry identity changed.");
            Require(Read(f.A, conflict.Current.Path) == (choice == "use-preserved" ? alternate : original), "Wrong chosen contents.");
            Require((f.A.GetInfo(conflict.Preserved.Path) is not null) == (choice == "keep-both"), "Preserved live copy disposition changed.");
            Require(Content(f.A).IsSupersetOf(new[] { "AAAA", "BBBB" }), "Choice lost recoverable content.");
            f.A.Dispose(); f.A = VaultEngine.Open(f.Options("a"), f.Credential);
            Require(f.A.ListConflicts().Items.Count == 0, "Review acknowledgement was lost on reopen.");
            f.A.FlushAsync().GetAwaiter().GetResult(); f.Sync();
            using var fresh = VaultEngine.Open(f.Options("fresh"), f.Credential);
            Require(fresh.ListConflicts().Items.Count == 0 && Content(fresh).IsSupersetOf(new[] { "AAAA", "BBBB" }), "Fresh device lost review or content.");
        }
    }
    internal static void Stale()
    {
        using var f = new Fixture(); f.Conflict(); var conflict = Only(f.A);
        f.A.WriteRange(conflict.Current!.Path, 0, "CCCC"u8);
        int before = f.A.ListVersions().Count; var pending = f.A.Status.PendingCommits;
        Rejected(() => Resolve(f.A, conflict, "use-preserved"));
        Require(Read(f.A, conflict.Current.Path) == "CCCC" && f.A.ListVersions().Count == before && f.A.Status.PendingCommits == pending, "Stale rejection mutated state.");
        var latest = Only(f.A); f.A.Rename(latest.Preserved!.Path, "renamed-by-user");
        Rejected(() => Resolve(f.A, latest, "keep-current"));
        var renamed = Only(f.A); Require(renamed.Preserved!.Path == "renamed-by-user", "Renamed conflict provenance was lost.");
        f.A.WriteRange(renamed.Preserved.Path, 0, "DDDD"u8);
        Rejected(() => Resolve(f.A, renamed, "keep-current"));
        Require(Read(f.A, renamed.Preserved.Path) == "DDDD", "Stale preserved version was deleted.");
        f.A.CreateFile("ordinary (conflict abcdef12)");
        Require(f.A.ListConflicts().Items.Count == 1, "Filename was treated as conflict evidence.");
        try { f.A.ListConflicts(1001); throw new Exception("Unbounded page accepted."); } catch (ArgumentOutOfRangeException) { }
        try { f.A.ResolveConflict("../../outside", "keep-both", latest.Current!.VersionId, latest.Preserved.VersionId); throw new Exception("Path identifier accepted."); } catch (InvalidDataException) { }
        var first = f.A.ListConflicts(1);
        Require(first.Items.Count == 1 && first.NextCursor is null && f.A.ListConflicts(1, first.Items[0].ConflictId).Items.Count == 0, "Bounded cursor did not advance.");
    }
    internal static void Concurrent()
    {
        foreach (bool reverse in new[] { false, true })
        {
            using var f = new Fixture(); f.Conflict(); var a = Only(f.A); var b = Only(f.B);
            f.A.ConflictCommitIdFactory = () => new string(reverse ? 'e' : '1', 32);
            f.B.ConflictCommitIdFactory = () => new string(reverse ? '1' : 'e', 32);
            Require(a.ConflictId == b.ConflictId, "Devices disagree on review identity.");
            Resolve(f.A, a, "keep-current"); Resolve(f.B, b, "use-preserved");
            f.A.FlushAsync().GetAwaiter().GetResult(); f.B.FlushAsync().GetAwaiter().GetResult(); f.Sync();
            Require(Content(f.A).IsSupersetOf(new[] { "AAAA", "BBBB" }) && Content(f.B).IsSupersetOf(new[] { "AAAA", "BBBB" }), "Opposite offline choices lost contents.");
            Require(f.A.Enumerate("").Select(e => (e.Path,e.EntryId,e.VersionId)).SequenceEqual(f.B.Enumerate("").Select(e => (e.Path,e.EntryId,e.VersionId))), "Opposite choices did not converge.");
            using var reopened = VaultEngine.Open(f.Options("fresh-review"), f.Credential);
            var disagreement = reopened.ListConflicts().Items.Single(item => item.Kind == "resolution-divergence");
            Require(disagreement.SupportedChoices.SequenceEqual(new[]{"keep-both"}) && !disagreement.Current!.IsLive && !disagreement.Preserved!.IsLive, "Divergent review was hidden or has unsafe choices.");
            var visible = new[] { reopened.PreviewVersion(disagreement.Current!.HistoryVersionId!).Text, reopened.PreviewVersion(disagreement.Preserved!.HistoryVersionId!).Text }.ToHashSet();
            Require(visible.SetEquals(new[] { "AAAA", "BBBB" }), "Divergent review does not expose both exact preserved values.");
            Require(f.A.ListConflicts().Items.Single(item => item.Kind == "resolution-divergence").ConflictId == disagreement.ConflictId
                && f.B.ListConflicts().Items.Single(item => item.Kind == "resolution-divergence").ConflictId == disagreement.ConflictId, "Divergence identity changed across devices or reopening.");
            var restoredA=f.A.ResolveConflict(disagreement.ConflictId,"keep-both",disagreement.Current.VersionId,disagreement.Preserved.VersionId);
            Rejected(()=>f.A.ResolveConflict(disagreement.ConflictId,"keep-both",disagreement.Current.VersionId,disagreement.Preserved.VersionId));
            var restoredB=f.B.ResolveConflict(disagreement.ConflictId,"keep-both",disagreement.Current.VersionId,disagreement.Preserved.VersionId);
            Require(restoredA.RestoredPaths!.Count==2&&restoredB.RestoredPaths!.Count==2,"Recovery did not report both actual names.");
            f.A.FlushAsync().GetAwaiter().GetResult();f.B.FlushAsync().GetAwaiter().GetResult();f.Sync();
            foreach(string path in restoredA.RestoredPaths.Concat(restoredB.RestoredPaths!))Require(f.A.GetInfo(path) is not null&&f.B.GetInfo(path) is not null,"Concurrent recovery lost a generated file.");
            using var recovered=VaultEngine.Open(f.Options("fresh-recovered"),f.Credential);
            Require(recovered.ListConflicts().Items.All(item=>item.Kind!="resolution-divergence"),"Recovery acknowledgement did not survive reopening.");
            Require(restoredA.RestoredPaths.Select(path=>Read(recovered,path)).ToHashSet().SetEquals(new[]{"AAAA","BBBB"}),"Recovered names do not contain both reviewed values.");
        }
    }
    internal static void UnobservedAcknowledgement()
    {
        using var f = new Fixture(); f.Conflict(); var conflict = Only(f.A);
        var before = f.A.GetEncryptedSnapshotPaths().ToHashSet();
        Resolve(f.A, conflict, "keep-both");
        string relative = f.A.GetEncryptedSnapshotPaths().Except(before).Single(path => path.StartsWith("commits/", StringComparison.Ordinal));
        string id = Path.GetFileNameWithoutExtension(relative);
        var read = typeof(VaultEngine).GetMethod("ReadMetadata", BindingFlags.Instance | BindingFlags.NonPublic)!.MakeGenericMethod(typeof(Commit));
        var write = typeof(VaultEngine).GetMethod("WriteMetadata", BindingFlags.Instance | BindingFlags.NonPublic)!.MakeGenericMethod(typeof(Commit));
        var original = (Commit)read.Invoke(f.A, [Path.Combine(f.A.CacheRoot, relative), "commit", id])!;
        var unobserved = new Commit { Id = Guid.NewGuid().ToString("N"), Versions = original.Versions, ConflictResolutions = original.ConflictResolutions, Parents = [] };
        write.Invoke(f.A, [Path.Combine(f.A.StorageRoot, "commits", unobserved.Id + ".mfe"), unobserved, "commit", unobserved.Id]);
        f.B.SyncAsync().GetAwaiter().GetResult();
        Require(Only(f.B).ConflictId == conflict.ConflictId, "A causally unobserved acknowledgement suppressed conflict review.");
        var wrongPair = new Commit { Id = Guid.NewGuid().ToString("N"), Versions = original.Versions, Parents = original.Parents,
            ConflictResolutions = [original.ConflictResolutions.Single() with { CurrentVersion = new string('0', 32) }] };
        write.Invoke(f.A, [Path.Combine(f.A.StorageRoot, "commits", wrongPair.Id + ".mfe"), wrongPair, "commit", wrongPair.Id]);
        f.B.SyncAsync().GetAwaiter().GetResult();
        Require(Only(f.B).ConflictId == conflict.ConflictId, "A wrong-pair acknowledgement suppressed conflict review.");
        var wrongEffect = new Commit { Id = Guid.NewGuid().ToString("N"), Versions = original.Versions, Parents = original.Parents,
            ConflictResolutions = [original.ConflictResolutions.Single() with { Choice = "keep-current" }] };
        write.Invoke(f.A, [Path.Combine(f.A.StorageRoot, "commits", wrongEffect.Id + ".mfe"), wrongEffect, "commit", wrongEffect.Id]);
        f.B.SyncAsync().GetAwaiter().GetResult();
        Require(Only(f.B).ConflictId == conflict.ConflictId, "A receipt without its claimed namespace effect suppressed conflict review.");
    }
    internal static void Unsupported()
    {
        foreach(var choice in new[]{"keep-change","apply-deletion"})
        {
            using var f = new Fixture();
            f.A.Delete("shared"); f.B.WriteRange("shared", 0, "BBBB"u8);
            f.A.FlushAsync().GetAwaiter().GetResult(); f.B.FlushAsync().GetAwaiter().GetResult(); f.Sync();
            var row=f.A.ListConflicts().Items.Single(item=>item.Kind=="delete-versus-edit");
            Require(row.Current is not null&&row.Preserved is null&&row.Deletion is not null&&row.SupportedChoices.Count==2,"Deletion intent is missing or fabricated as live content.");
            Require(Read(f.A, "shared") == "BBBB", "Deletion review changed surviving edit.");
            f.A.ResolveConflict(row.ConflictId,choice,row.Current!.VersionId,null,row.Deletion!.DeletionCommitId);
            Require(f.A.ListConflicts().Items.Count==0,"Deletion decision remained unresolved.");
            f.A.FlushAsync().GetAwaiter().GetResult();f.Sync();
            using var fresh=VaultEngine.Open(f.Options("fresh-deletion"),f.Credential);
            Require(fresh.ListConflicts().Items.Count==0,"Deletion acknowledgement was lost after reopening.");
            Require((fresh.GetInfo("shared") is not null)==(choice=="keep-change"),"Deletion choice changed the wrong live state.");
            Require(Content(fresh).Contains("BBBB"),"Reviewed deletion lost edited history.");
        }
    }
    internal static void RenameChoices()
    {
        foreach (var choice in new[] { "keep-current", "use-preserved", "keep-both" })
        {
            using var f = new Fixture();
            f.A.Rename("shared", "first"); f.B.Rename("shared", "second");
            f.A.FlushAsync().GetAwaiter().GetResult(); f.B.FlushAsync().GetAwaiter().GetResult(); f.Sync();
            var conflict = f.A.ListConflicts().Items.Single(item => item.Kind == "rename");
            Require(conflict.SupportedChoices.Count == 3, "File rename choices are missing.");
            string currentPath = conflict.Current!.Path, preservedPath = conflict.Preserved!.Path, retainedId = conflict.Current.EntryId;
            Resolve(f.A, conflict, choice); f.A.FlushAsync().GetAwaiter().GetResult(); f.Sync();
            string selectedPath = choice == "use-preserved" ? preservedPath : currentPath;
            Require(f.A.GetInfo(selectedPath)!.EntryId == retainedId, "Rename decision lost original logical identity.");
            Require(f.A.ListConflicts().Items.Count == 0, "Rename review did not persist.");
            Require(f.A.Enumerate("").Count == (choice == "keep-both" ? 2 : 1), "Rename retained wrong namespace entries.");
            using var fresh = VaultEngine.Open(f.Options("fresh-rename"), f.Credential);
            Require(fresh.ListConflicts().Items.Count == 0 && Read(fresh, selectedPath) == "base", "Rename choice failed fresh replay.");
        }
    }
    internal static void DeletionStale()
    {
        using var f=new Fixture();f.A.Delete("shared");f.B.WriteRange("shared",0,"BBBB"u8);
        f.A.FlushAsync().GetAwaiter().GetResult();f.B.FlushAsync().GetAwaiter().GetResult();f.Sync();
        var row=f.A.ListConflicts().Items.Single(item=>item.Deletion is not null);
        f.A.WriteRange("shared",0,"CCCC"u8);
        Rejected(()=>f.A.ResolveConflict(row.ConflictId,"apply-deletion",row.Current!.VersionId,null,row.Deletion!.DeletionCommitId));
        Require(Read(f.A,"shared")=="CCCC","Stale deletion removed newer contents.");
        var fresh=f.A.ListConflicts().Items.Single(item=>item.Deletion is not null);
        f.A.ResolveConflict(fresh.ConflictId,"keep-change",fresh.Current!.VersionId,null,fresh.Deletion!.DeletionCommitId);
        f.B.WriteRange("shared",0,"DDDD"u8);f.B.FlushAsync().GetAwaiter().GetResult();
        f.A.FlushAsync().GetAwaiter().GetResult();f.Sync();
        Require(f.A.ListConflicts().Items.Count>0,"An acknowledgement suppressed an unseen concurrent edit.");
        Require(Content(f.A).Contains("DDDD"),"New concurrent edit became undiscoverable.");
    }
    internal static void RenameRollback()
    {
        using var f=new Fixture();f.A.Rename("shared","first");f.B.Rename("shared","second");
        f.A.FlushAsync().GetAwaiter().GetResult();f.B.FlushAsync().GetAwaiter().GetResult();f.Sync();
        var row=f.A.ListConflicts().Items.Single(item=>item.Kind=="rename");
        using var currentLease=f.A.AcquireOpenById(row.Current!.EntryId);using var alternateLease=f.A.AcquireOpenById(row.Preserved!.EntryId);
        int versions=f.A.ListVersions().Count;var names=f.A.Enumerate("").Select(item=>(item.Path,item.EntryId,item.VersionId)).ToArray();
        f.A.ConflictCommitIdFactory=()=>"invalid/identity";
        try{Resolve(f.A,row,"use-preserved");throw new Exception("Invalid transaction identity was accepted.");}catch(InvalidDataException){}
        f.A.ConflictCommitIdFactory=null;
        Require(names.SequenceEqual(f.A.Enumerate("").Select(item=>(item.Path,item.EntryId,item.VersionId)))&&f.A.ListVersions().Count==versions,"Failed rename transaction changed names or history.");
        var buffer=new byte[4];f.A.ReadRangeById(row.Preserved.EntryId,0,buffer);Require(Encoding.UTF8.GetString(buffer)=="base","Failed rename lost held alternate contents.");
        f.A.Rename(row.Preserved.Path,"moved-alternate");f.A.CreateFile(row.Preserved.Path);f.A.WriteRange(row.Preserved.Path,0,"third"u8);
        Rejected(()=>Resolve(f.A,row,"use-preserved"));
        Require(Read(f.A,row.Preserved.Path)=="third","Stale rename replaced a third-party destination.");
    }
    internal static void DeletionConcurrent()
    {
        foreach(bool reverse in new[]{false,true})
        {
            using var f=new Fixture();f.A.Delete("shared");f.B.WriteRange("shared",0,"BBBB"u8);
            f.A.FlushAsync().GetAwaiter().GetResult();f.B.FlushAsync().GetAwaiter().GetResult();f.Sync();
            var row=f.A.ListConflicts().Items.Single(item=>item.Deletion is not null);
            f.A.ConflictCommitIdFactory=()=>new string(reverse?'e':'1',32);f.B.ConflictCommitIdFactory=()=>new string(reverse?'1':'e',32);
            f.A.ResolveConflict(row.ConflictId,"keep-change",row.Current!.VersionId,null,row.Deletion!.DeletionCommitId);
            f.B.ResolveConflict(row.ConflictId,"apply-deletion",row.Current.VersionId,null,row.Deletion.DeletionCommitId);
            f.A.FlushAsync().GetAwaiter().GetResult();f.B.FlushAsync().GetAwaiter().GetResult();f.Sync();
            using var fresh=VaultEngine.Open(f.Options("fresh-opposed-deletion"),f.Credential);
            Require(Read(fresh,"shared")=="BBBB"&&fresh.ListConflicts().Items.Any(item=>item.Deletion is not null),"Concurrent deletion silently defeated explicit keep intent.");
        }
    }
    internal static void Paging()
    {
        using var f=new Fixture();f.A.CreateFile("second");f.A.WriteRange("second",0,"base"u8);f.A.FlushAsync().GetAwaiter().GetResult();f.B.SyncAsync().GetAwaiter().GetResult();
        f.A.WriteRange("second",0,"AAAA"u8);f.B.WriteRange("second",0,"BBBB"u8);f.Conflict();
        var all=f.A.ListConflicts().Items.Select(item=>item.ConflictId).ToArray();Require(all.Length==2,"Pagination fixture did not produce two independent reviews.");
        var first=f.A.ListConflicts(1);var second=f.A.ListConflicts(1,first.NextCursor);
        Require(first.NextCursor is not null&&second.NextCursor is null&&new[]{first.Items.Single().ConflictId,second.Items.Single().ConflictId}.SequenceEqual(all),"Bounded pages skipped or repeated a review.");
    }
    internal static void RecoveryParents()
    {
        foreach(string mode in new[]{"renamed","deleted","file-occupied"})
        {
            using var f=new Fixture();f.A.CreateDirectory("folder");f.A.Rename("shared","folder/shared");f.A.FlushAsync().GetAwaiter().GetResult();f.B.SyncAsync().GetAwaiter().GetResult();
            f.A.WriteRange("folder/shared",0,"AAAA"u8);f.B.WriteRange("folder/shared",0,"BBBB"u8);
            f.A.FlushAsync().GetAwaiter().GetResult();f.B.FlushAsync().GetAwaiter().GetResult();f.Sync();
            Resolve(f.A,Only(f.A),"keep-current");Resolve(f.B,Only(f.B),"use-preserved");f.A.FlushAsync().GetAwaiter().GetResult();f.B.FlushAsync().GetAwaiter().GetResult();f.Sync();
            if(mode=="renamed")f.A.Rename("folder","moved-folder");
            else
            {
                foreach(var entry in f.A.Enumerate("folder"))f.A.Delete(entry.Path);
                f.A.Delete("folder");
                if(mode=="file-occupied"){f.A.CreateFile("folder");f.A.WriteRange("folder",0,"unrelated"u8);}
            }
            var row=f.A.ListConflicts().Items.Single(item=>item.Kind=="resolution-divergence");
            Require(row.RecoveryDirectory=="","Recovery did not explicitly advertise the vault root.");
            var restored=f.A.ResolveConflict(row.ConflictId,"keep-both",row.Current!.VersionId,row.Preserved!.VersionId);
            Require(restored.RestoredPaths!.Count==2&&restored.RestoredPaths.All(path=>!path.Contains('/')),"Recovery recreated or relied on a historical parent.");
            Require(restored.RestoredPaths.Select(path=>Read(f.A,path)).ToHashSet().SetEquals(new[]{"AAAA","BBBB"}),"Root recovery lost one reviewed value.");
            if(mode=="file-occupied")Require(Read(f.A,"folder")=="unrelated","Recovery replaced an unrelated ancestor occupant.");
            if(mode=="deleted")Require(f.A.GetInfo("folder") is null,"Recovery recreated a deleted ancestor.");
            if(mode=="renamed")Require(f.A.GetInfo("folder") is null&&f.A.GetInfo("moved-folder")!.IsDirectory,"Recovery changed the renamed ancestor.");
        }
    }
}
