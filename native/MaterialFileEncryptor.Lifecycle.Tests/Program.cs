using System.Reflection;
using System.Text.Json;
using MaterialFileEncryptor.Core;

CoreTransferRegression.Run();

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

    engine.CreateFile("second.bin");
    var page = Json(Call(controller, "Execute", "listFiles", Json(new { limit = 1 })));
    Assert(page.GetProperty("items").GetArrayLength() == 1 && page.GetProperty("nextCursor").GetInt32() == 1, "File page was not bounded");
    long revision = page.GetProperty("revision").GetInt64(); engine.CreateFile("third.bin");
    page = Json(Call(controller, "Execute", "listFiles", Json(new { limit = 1, cursor = 1, revision })));
    Assert(page.GetProperty("resetRequired").GetBoolean(), "Changed revision did not invalidate file cursor");
    var result = Json(Call(controller, "Execute", "forceLock", Json(new { })));
    Assert(result.GetProperty("locked").GetBoolean() && !result.GetProperty("busy").GetBoolean(), "Idle force-lock did not complete");
    Console.WriteLine("PASS revision paging and idle force-lock");
}
finally { ((IDisposable)controller).Dispose(); Directory.Delete(root, true); }
