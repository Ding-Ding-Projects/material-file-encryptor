using System.Reflection;
using System.Text.Json;
using MaterialFileEncryptor.Core;

if (args.Length == 2 && args[0] == "--journal-child") { JournalRegression.Child(args[1]); return; }
if (args.Length == 1 && args[0] == "--legacy-only") { CoreTransferRegression.Run();CngLegacyRegression.Run();return; }
if (args.Length == 1 && args[0] == "--phase-only") { await TransferPhaseRegression.Run();StorageStageRegression.Run();return; }
if (args.Length == 1 && args[0] == "--priority-only") { BackgroundPriorityRegression.Run();return; }
if (args.Length == 1 && args[0] == "--large-background-only") { await LargeManagedImportRegression.Run(true);return; }
if (args.Length == 1 && args[0] == "--large-managed-only") { await LargeManagedImportRegression.Run();return; }
if (args.Length == 1 && args[0] == "--large-import-only") { LargeImportRegression.Run();return; }

CoreTransferRegression.Run();
CngLegacyRegression.Run();
JournalRegression.Run();
await StatusProtocolRegression.Run();
await BackgroundAdmissionRegression.Run();
await TransferPhaseRegression.Run();
StorageStageRegression.Run();

var type = Assembly.Load("MaterialFileEncryptor.Host").GetType("MaterialFileEncryptor.Host.VaultController", true)!;
object Make() => Activator.CreateInstance(type)!;
object? Call(object instance, string method, params object[] values) => type.GetMethod(method, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!.Invoke(instance, values);
void Set(object instance, string field, object value) => type.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(instance, value);
object Get(object instance, string field) => type.GetField(field, BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(instance)!;
JsonElement Json(object? value) => JsonSerializer.SerializeToElement(value);
void Assert(bool value, string message) { if (!value) throw new Exception(message); }
var root = Path.Combine(Path.GetTempPath(), "mfe-lifecycle-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var controller = Make();
using var credentials = VaultCredentials.Password("lifecycle fixture only");
var engine = VaultEngine.Create(new VaultOptions { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache"), PartSizeBytes = 1048576 }, credentials);
Set(controller, "vault", engine); Set(controller, "storageDir", engine.StorageRoot); Set(controller, "cacheDir", engine.CacheRoot);
try
{
    Call(controller, "Status");
    object engineGate = typeof(VaultEngine).GetField("gate", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(engine)!;
    lock (engineGate)
    {
        var statusRead = Task.Factory.StartNew(() => (Task<object?>)Call(controller, "DispatchAsync", "status", Json(new { }))!);
        Assert(statusRead.Wait(TimeSpan.FromSeconds(1)), "Status reader waited for the crypto lock");
        Assert(statusRead.Result.IsCompleted, "Status result waited for the crypto lock");
        var summaryRead=Task.Factory.StartNew(()=>(Task<object?>)Call(controller,"DispatchAsync","statusSummary",Json(new{}))!);
        Assert(summaryRead.Wait(TimeSpan.FromSeconds(1))&&summaryRead.Result.IsCompleted,"Summary waited for the crypto lock");
    }
    Console.WriteLine("PASS control status returns cached snapshot while encryption is busy");
    var summaryBefore=Call(controller,"StatusSummary");
    Call(controller,"Status");
    Assert(ReferenceEquals(summaryBefore,Call(controller,"StatusSummary")),"Unchanged summary created an idle event");
    Assert(!Json(summaryBefore).TryGetProperty("files",out _),"Summary contains full file inventory");
    Console.WriteLine("PASS compact unchanged status snapshot is retained");

    Set(controller, "activePreparedOperations", 2);
    lock (Get(controller, "gate"))
    {
        var response = Task.Run(() => Json(Call(controller, "Execute", "forceLock", Json(new { }))));
        Assert(response.Wait(TimeSpan.FromSeconds(1)), "Force-lock diagnostics waited for controller lock");
        Assert(response.Result.GetProperty("activePreparedOperations").GetInt32() == 2, "Prepared-work snapshot was missing");
        Assert(response.Result.GetProperty("activeFilesystemIo").GetInt32() == 0, "Absent filesystem reported active I/O");
    }
    Set(controller, "activePreparedOperations", 0);
    Console.WriteLine("PASS force-lock diagnostics return without waiting for controller lock");

    var semaphore = (SemaphoreSlim)Get(controller, "commandWorker");
    await semaphore.WaitAsync();
    var pending = (Task<object?>)Call(controller, "DispatchAsync", "setHistoryRetention", Json(new { days = 7 }))!;
    var busy = Json(Call(controller, "Execute", "forceLock", Json(new { })));
    Assert(busy.GetProperty("busy").GetBoolean() && !busy.GetProperty("locked").GetBoolean(), "Queued command did not veto force-lock");
    semaphore.Release(); await pending.WaitAsync(TimeSpan.FromSeconds(5));
    Console.WriteLine("PASS queued command vetoes force-lock without waiting for worker");

    var registry = Get(controller, "operations");
    var worker = (SemaphoreSlim)registry.GetType().GetField("worker", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(registry)!;
    await worker.WaitAsync();
    string file = Path.Combine(root, "example.bin"); File.WriteAllBytes(file, new byte[256 * 1024]);
    var start = Json(Call(controller, "Execute", "startImport", Json(new { paths = new[] { file } })));
    string id = start.GetProperty("operationId").GetString()!;
    busy = Json(Call(controller, "Execute", "forceLock", Json(new { })));
    Assert(busy.GetProperty("busy").GetBoolean(), "Queued transfer did not veto force-lock");
    var cancel = Json(Call(controller, "Execute", "cancelOperation", Json(new { operationId = id })));
    Assert(cancel.GetProperty("accepted").GetBoolean(), "Cancel was not admitted independently");
    worker.Release();
    for (int attempt = 0; attempt < 100; ++attempt)
    {
        var operations = Json(Call(controller, "Execute", "operations", Json(new { })));
        if (operations[0].GetProperty("state").GetString() == "cancelled") break;
        await Task.Delay(10);
    }
    Assert(engine.GetInfo("example.bin") is null, "Cancelled queued import installed a file");
    Console.WriteLine("PASS queued import cancellation and force-lock busy response");

    start = Json(Call(controller, "Execute", "startImport", Json(new { paths = new[] { file } })));
    id = start.GetProperty("operationId").GetString()!;
    string? state = null;
    for (int attempt = 0; attempt < 500; ++attempt)
    {
        var operations = Json(Call(controller, "Execute", "operations", Json(new { })));
        state = operations.EnumerateArray().Single(value => value.GetProperty("operationId").GetString() == id).GetProperty("state").GetString();
        if (state is "completed" or "failed") break;
        await Task.Delay(10);
    }
    Assert(state == "completed" && engine.GetInfo("example.bin")?.Length == 256 * 1024, "Managed import did not atomically install complete file");
    cancel = Json(Call(controller, "Execute", "cancelOperation", Json(new { operationId = id })));
    Assert(!cancel.GetProperty("accepted").GetBoolean() && cancel.GetProperty("state").GetString() == "completed", "Late cancel relabelled completed file");
    Console.WriteLine("PASS completed import remains completed after late cancellation");

    engine.CreateFile("snapshot.bin");
    byte[] snapshotBytes=Enumerable.Range(0,131072).Select(i=>(byte)(i%251)).ToArray();
    engine.WriteRange("snapshot.bin",0,snapshotBytes);await engine.FlushAsync();
    using(var snapshot=engine.AcquireReadSnapshot("snapshot.bin"))
    {
        Assert(engine.EvictEntryCache("snapshot.bin")==0,"Active snapshot allowed ciphertext eviction");
        engine.WriteRange("snapshot.bin",0,new byte[65536]);engine.Delete("snapshot.bin");
        engine.EvictCache(long.MaxValue);
        byte[] actual=new byte[snapshotBytes.Length];
        for(int offset=0;offset<actual.Length;offset+=65536)
        {await snapshot.PrepareRangeAsync(offset,65536);Assert(snapshot.ReadRange(offset,actual.AsSpan(offset,65536))==65536,"Snapshot returned short data");}
        Assert(actual.SequenceEqual(snapshotBytes),"Concurrent edit/delete changed snapshot content");
    }
    Console.WriteLine("PASS immutable read snapshot survives edit, delete and cache eviction");

    string exportCurrent=Path.Combine(root,"current-export.bin");File.WriteAllText(exportCurrent,"previous export");
    int versionsBeforeExport=engine.ListVersions().Count;
    using(var stopExport=new CancellationTokenSource())
    {
        Action<long,long,int,int> cancelProgress=(bytes,total,complete,count)=>{if(bytes>0)stopExport.Cancel();};
        bool cancelled=false;
        try{Call(controller,"ExportCurrentFile",Json(new{path="example.bin",destination=exportCurrent}),stopExport.Token,cancelProgress);}
        catch(TargetInvocationException error) when(error.InnerException is OperationCanceledException){cancelled=true;}
        Assert(cancelled&&File.ReadAllText(exportCurrent)=="previous export","Cancelled export replaced destination");
        Assert(!Directory.EnumerateFiles(root,"current-export.bin.*.tmp").Any(),"Cancelled export retained temporary plaintext");
    }
    Assert(engine.ListVersions().Count==versionsBeforeExport,"Current export created an unsolicited version");
    Assert(engine.ListActivity(new(Limit:100)).Items.Any(item=>item.Action=="cancel"&&item.Detail=="Managed export cancelled"),"Cancelled export activity was not retained");
    start=Json(Call(controller,"Execute","startExport",Json(new{path="example.bin",destination=exportCurrent})));
    id=start.GetProperty("operationId").GetString()!;
    for(int attempt=0;attempt<500;attempt++)
    {
        var rows=Json(Call(controller,"Execute","operations",Json(new{})));
        state=rows.EnumerateArray().Single(row=>row.GetProperty("operationId").GetString()==id).GetProperty("state").GetString();
        if(state is "completed" or "failed")break;await Task.Delay(10);
    }
    Assert(state=="completed"&&File.ReadAllBytes(exportCurrent).SequenceEqual(File.ReadAllBytes(file)),"Current export content differs");
    cancel=Json(Call(controller,"Execute","cancelOperation",Json(new{operationId=id})));
    Assert(!cancel.GetProperty("accepted").GetBoolean()&&cancel.GetProperty("state").GetString()=="completed","Late export cancel changed installed result");
    bool invalid=false;
    try{Call(controller,"Execute","startExport",Json(new{path="example.bin",versionId="invalid",destination=exportCurrent}));}
    catch(TargetInvocationException error) when(error.InnerException is ArgumentException){invalid=true;}
    Assert(invalid,"Ambiguous export selection was accepted");
    Console.WriteLine("PASS managed current export cancellation, atomic install, selection validation and late cancellation");

    engine.CreateFile("preview.txt"); engine.WriteRange("preview.txt",0,System.Text.Encoding.UTF8.GetBytes("hello version"));
    await engine.SaveVersionAsync("preview.txt");
    var version = engine.ListVersions(engine.GetInfo("preview.txt")!.EntryId).First();
    var preview = Json(Call(controller,"Execute","previewVersion",Json(new { versionId=version.Id })));
    Assert(preview.GetProperty("text").GetString()=="hello version","Version preview protocol changed text");
    Call(controller,"Execute","labelVersion",Json(new { versionId=version.Id,label="Saved text" }));
    string export = Path.Combine(root,"export.txt"); File.WriteAllText(export,"previous destination");
    Call(controller,"Execute","exportVersion",Json(new { versionId=version.Id,destination=export }));
    Assert(File.ReadAllText(export)=="hello version","Exported version differs from selected snapshot");
    var activity = Json(Call(controller,"Execute","listActivity",Json(new { entryId=version.EntryId,limit=100 })));
    Assert(activity.GetProperty("items").EnumerateArray().Any(item=>item.GetProperty("action").GetString()=="export"),"Export activity missing from protocol");
    Console.WriteLine("PASS selected preview, label, atomic export and camel-case activity protocol");

    engine.CreateFile("second.bin");
    var page = Json(Call(controller, "Execute", "listFiles", Json(new { limit = 1 })));
    Assert(page.GetProperty("items").GetArrayLength() == 1 && page.GetProperty("nextCursor").GetInt32() == 1, "File page was not bounded");
    long revision = page.GetProperty("revision").GetInt64(); engine.CreateFile("third.bin");
    string stableId=engine.GetInfo("third.bin")!.EntryId;engine.Rename("third.bin","renamed-third.bin");
    var selected=Json(Call(controller,"Execute","getFile",Json(new{entryId=stableId})));
    Assert(selected.GetProperty("path").GetString()=="renamed-third.bin","ID lookup did not resolve current path");
    page = Json(Call(controller, "Execute", "listFiles", Json(new { limit = 1, cursor = 1, revision })));
    Assert(page.GetProperty("resetRequired").GetBoolean(), "Changed revision did not invalidate file cursor");
    var result = Json(Call(controller, "Execute", "forceLock", Json(new { })));
    Assert(result.GetProperty("locked").GetBoolean() && !result.GetProperty("busy").GetBoolean(), "Idle force-lock did not complete");
    Console.WriteLine("PASS revision paging and idle force-lock");
}
finally { ((IDisposable)controller).Dispose(); Directory.Delete(root, true); }
