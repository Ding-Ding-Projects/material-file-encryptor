using System.Reflection;
using System.Text.Json;
using MaterialFileEncryptor.Core;

static partial class Regression
{
    static void ConflictReview()
    {
        string root = Path.Combine(Path.GetTempPath(), "mfe-controller-conflict-" + Guid.NewGuid().ToString("N"));
        object? controller = null;
        try
        {
            var engine = Create(root, 4096);
            controller = Make(engine, root, new ImmediateTransport());
            engine.CreateFile("shared"); engine.WriteRange("shared", 0, "base"u8); engine.FlushAsync().GetAwaiter().GetResult();
            using var credential = VaultCredentials.Password("controller regression fixture only");
            using var peer = VaultEngine.Open(new VaultOptions { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "peer"), PartSizeBytes = 4096 }, credential);
            engine.WriteRange("shared", 0, "AAAA"u8); peer.WriteRange("shared", 0, "BBBB"u8);
            engine.FlushAsync().GetAwaiter().GetResult(); peer.FlushAsync().GetAwaiter().GetResult(); engine.SyncAsync().GetAwaiter().GetResult();
            var page = JsonSerializer.SerializeToElement(Call(controller, "Execute", "listConflicts", JsonSerializer.SerializeToElement(new { limit = 1 })));
            var row = page.GetProperty("items")[0];
            Assert(page.TryGetProperty("nextCursor", out _) && row.GetProperty("supportedChoices").GetArrayLength() == 3, "Conflict wire shape is incomplete.");
            var current = row.GetProperty("current"); var preserved = row.GetProperty("preserved");
            var request = new { conflictId = row.GetProperty("conflictId").GetString(), choice = "keep-both", currentVersion = current.GetProperty("versionId").GetString(), preservedVersion = preserved.GetProperty("versionId").GetString() };
            try
            {
                Call(controller, "Execute", "resolveConflict", JsonSerializer.SerializeToElement(request with { currentVersion = new string('0', 32) }));
                throw new Exception("Controller accepted stale versions.");
            }
            catch (TargetInvocationException error) when (error.InnerException is InvalidOperationException) { }
            Assert(engine.ListConflicts().Items.Count == 1, "Stale controller request acknowledged review.");
            var result = JsonSerializer.SerializeToElement(Call(controller, "Execute", "resolveConflict", JsonSerializer.SerializeToElement(request)));
            Assert(result.GetProperty("resolved").GetBoolean() && result.GetProperty("choice").GetString() == "keep-both", "Controller did not return durable review result.");
            Assert(engine.ListConflicts().Items.Count == 0 && engine.Enumerate("").Count == 2, "Keep both did not retain both files.");
            engine.CreateFile("to-delete");engine.WriteRange("to-delete",0,"base"u8);engine.FlushAsync().GetAwaiter().GetResult();peer.SyncAsync().GetAwaiter().GetResult();
            engine.Delete("to-delete");peer.WriteRange("to-delete",0,"edit"u8);engine.FlushAsync().GetAwaiter().GetResult();peer.FlushAsync().GetAwaiter().GetResult();engine.SyncAsync().GetAwaiter().GetResult();
            var deletionPage=JsonSerializer.SerializeToElement(Call(controller,"Execute","listConflicts",JsonSerializer.SerializeToElement(new{limit=100})));
            var deletionRow=deletionPage.GetProperty("items").EnumerateArray().Single(item=>item.GetProperty("kind").GetString()=="delete-versus-edit");
            Assert(deletionRow.GetProperty("preserved").ValueKind==JsonValueKind.Null,"Deletion was represented as a content side.");
            var deletionResult=JsonSerializer.SerializeToElement(Call(controller,"Execute","resolveConflict",JsonSerializer.SerializeToElement(new{
                conflictId=deletionRow.GetProperty("conflictId").GetString(),choice="apply-deletion",currentVersion=deletionRow.GetProperty("current").GetProperty("versionId").GetString(),
                preservedVersion=(string?)null,deletionCommitId=deletionRow.GetProperty("deletion").GetProperty("deletionCommitId").GetString()})));
            Assert(deletionResult.GetProperty("resolved").GetBoolean()&&engine.GetInfo("to-delete") is null&&engine.ListDeleted().Any(item=>item.Path=="to-delete"),"Controller deletion did not preserve recovery history.");
            Console.WriteLine("PASS conflict controller: camelCase DTO, stale rejection, durable keep-both acknowledgement");
        }
        finally
        {
            (controller as IDisposable)?.Dispose();
            if (Directory.Exists(root)) Directory.Delete(root, true);
        }
    }
}
