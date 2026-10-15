using System.Reflection;
using System.Text.Json;
using MaterialFileEncryptor.Core;
using MaterialFileEncryptor.Host;

// Force lock must succeed when nothing is really using the drive, and must
// cancel or drain the controller's own work instead of refusing forever.
internal static class ForceLockRegression
{
    static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    static readonly BindingFlags Instance = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;
    static T Field<T>(object target, string name) => (T)target.GetType().GetField(name, Instance)!.GetValue(target)!;
    static void SetField(object target, string name, object? value) => target.GetType().GetField(name, Instance)!.SetValue(target, value);
    static JsonElement Lock(VaultController controller, object? args = null) =>
        JsonSerializer.SerializeToElement(controller.Execute("forceLock", JsonSerializer.SerializeToElement(args ?? new { })));
    static VaultOptions Options(string root) => new() { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache"), PartSizeBytes = 1048576 };
    static VaultCredentials Credentials() => VaultCredentials.Password("force lock fixture only");

    static VaultController Make(string root, out VaultEngine engine)
    {
        Directory.CreateDirectory(root);
        var controller = new VaultController();
        using var credentials = Credentials();
        engine = VaultEngine.Create(Options(root), credentials);
        SetField(controller, "vault", engine);
        SetField(controller, "storageDir", engine.StorageRoot);
        SetField(controller, "cacheDir", engine.CacheRoot);
        controller.Status();
        return controller;
    }

    internal static async Task Run()
    {
        string root = Path.Combine(Path.GetTempPath(), "mfe-force-lock-" + Guid.NewGuid().ToString("N"));
        try
        {
            await IdleWithUncommittedWrite(Path.Combine(root, "idle"));
            await BackgroundSynchronizationIsCancelledNotAwaitedForever(Path.Combine(root, "sync"));
            await StatusPollerHoldingTheCryptoLockIsWaitedFor(Path.Combine(root, "gate"));
            await QueuedTransferIsCancelled(Path.Combine(root, "transfer"));
            await AdmissionClosesWhileDraining(Path.Combine(root, "admission"));
            HandlesAreReleasedAndLateCloseIsHarmless(Path.Combine(root, "handles"));
            BusyMessagesNameTheHolderKindAndOfferForceLock();
            await FlushJournalCommitsWithoutLocking(Path.Combine(root, "flush"));
        }
        finally { try { Directory.Delete(root, true); } catch { } }
    }

    static async Task IdleWithUncommittedWrite(string root)
    {
        using var controller = Make(root, out var engine);
        engine.CreateFile("kept.bin");
        engine.WriteRange("kept.bin", 0, new byte[] { 9, 8, 7 });
        var result = Lock(controller);
        Assert(result.GetProperty("locked").GetBoolean() && !result.GetProperty("busy").GetBoolean(), "Idle force lock was refused.");
        Assert(Field<object?>(controller, "vault") is null, "Force lock did not close the engine.");
        using var credentials = Credentials();
        using var reopened = VaultEngine.Open(Options(root), credentials);
        byte[] data = new byte[3]; reopened.ReadRange("kept.bin", 0, data);
        Assert(data.SequenceEqual(new byte[] { 9, 8, 7 }), "A write accepted just before force lock was lost.");
        Console.WriteLine("PASS idle force lock succeeds and keeps a write accepted just before it");
        await Task.CompletedTask;
    }

    static async Task BackgroundSynchronizationIsCancelledNotAwaitedForever(string root)
    {
        using var controller = Make(root, out _);
        using var cancellation = new CancellationTokenSource();
        // Model a long synchronization: it owns the background slot and only ends
        // when it is cancelled, as the real network and subprocess waits do.
        Assert(controller.TryBeginBackgroundWork(), "Background slot was unavailable.");
        SetField(controller, "syncCancellation", cancellation);
        var synchronization = Task.Run(async () =>
        {
            try { await Task.Delay(Timeout.Infinite, cancellation.Token); } catch (OperationCanceledException) { }
            await Task.Delay(100);
            controller.EndBackgroundWork();
        });
        var result = await Task.Run(() => Lock(controller, new { timeoutMs = 10000 })).WaitAsync(TimeSpan.FromSeconds(15));
        await synchronization;
        Assert(cancellation.IsCancellationRequested, "Force lock did not cancel the synchronization.");
        Assert(result.GetProperty("locked").GetBoolean(), "Force lock refused while only a cancellable synchronization was running.");
        Console.WriteLine("PASS force lock cancels a running synchronization and locks once it settles");
    }

    static async Task StatusPollerHoldingTheCryptoLockIsWaitedFor(string root)
    {
        using var controller = Make(root, out _);
        object gate = Field<object>(controller, "gate");
        using var held = new ManualResetEventSlim();
        var poller = Task.Run(() => { lock (gate) { held.Set(); Thread.Sleep(600); } });
        held.Wait();
        var result = await Task.Run(() => Lock(controller));
        await poller;
        Assert(result.GetProperty("locked").GetBoolean(), "A momentary crypto-lock hold by the status poller made force lock report busy.");
        Console.WriteLine("PASS force lock waits out a momentary crypto-lock hold instead of reporting busy");
    }

    static async Task QueuedTransferIsCancelled(string root)
    {
        using var controller = Make(root, out _);
        var registry = Field<object>(controller, "operations");
        var worker = (SemaphoreSlim)registry.GetType().GetField("worker", Instance)!.GetValue(registry)!;
        await worker.WaitAsync();
        string file = Path.Combine(root, "payload.bin"); File.WriteAllBytes(file, new byte[64 * 1024]);
        controller.Execute("startImport", JsonSerializer.SerializeToElement(new { paths = new[] { file } }));
        var result = await Task.Run(() => Lock(controller, new { timeoutMs = 10000 }));
        Assert(result.GetProperty("locked").GetBoolean(), "A queued transfer made force lock refuse.");
        var rows = JsonSerializer.SerializeToElement(controller.Execute("operations", default));
        Assert(rows.EnumerateArray().All(row => row.GetProperty("state").GetString() == "cancelled"), "Force lock left a transfer unfinished.");
        worker.Release();
        Console.WriteLine("PASS force lock cancels queued transfers and then locks");
    }

    static async Task AdmissionClosesWhileDraining(string root)
    {
        using var controller = Make(root, out _);
        var semaphore = Field<SemaphoreSlim>(controller, "commandWorker");
        await semaphore.WaitAsync();
        var queued = (Task<object?>)controller.DispatchAsync("setHistoryRetention", JsonSerializer.SerializeToElement(new { days = 7 }));
        var forcing = Task.Run(() => Lock(controller, new { timeoutMs = 3000 }));
        for (int attempt = 0; attempt < 200 && !Field<bool>(controller, "forceDraining"); ++attempt) await Task.Delay(10);
        Assert(Field<bool>(controller, "forceDraining"), "Force lock never entered its draining phase.");
        bool rejected = false;
        try { controller.DispatchAsync("sync", default); } catch (InvalidOperationException) { rejected = true; }
        Assert(rejected, "A command was admitted while force lock was draining.");
        Assert(!controller.TryBeginBackgroundWork(), "Background work was admitted while force lock was draining.");
        semaphore.Release();
        await queued.WaitAsync(TimeSpan.FromSeconds(5));
        var result = await forcing.WaitAsync(TimeSpan.FromSeconds(10));
        Assert(result.GetProperty("locked").GetBoolean(), "Force lock did not finish after the queued command drained.");
        Console.WriteLine("PASS force lock closes admission while draining, then locks after queued work settles");
    }

    static void HandlesAreReleasedAndLateCloseIsHarmless(string root)
    {
        Directory.CreateDirectory(root);
        using var credentials = Credentials();
        using var engine = VaultEngine.Create(Options(root), credentials);
        using (var stage = engine.BeginImport("held.bin")) { stage.Write(0, new byte[] { 1, 2, 3 }); stage.Commit(); }
        var filesystem = new VaultFileSystem(engine, new object());
        object?[] OpenOne()
        {
            object?[] values = { "held.bin", 0u, 0u, null, null, null, null };
            if (filesystem.Open("held.bin", 0u, 0u, out var node, out var descriptor, out _, out _) != 0) throw new Exception("Synthetic open failed.");
            values[3] = node; values[4] = descriptor; return values;
        }
        var first = OpenOne(); var second = OpenOne();
        var holders = filesystem.DescribeHolders();
        Assert(holders.Handles == 2 && holders.Explorer + holders.Search + holders.Security + holders.Application + holders.Other == 2, "Holders were not counted by kind.");
        Assert(!filesystem.BeginForceUnmount(), "The ordinary force admission released retained descriptors.");
        Assert(filesystem.BeginForcedRelease(out int released) && released == 2, "Forced release did not release both descriptors.");
        Assert(filesystem.ActiveHandles == 0, "Handle count stayed non-zero after forced release.");
        filesystem.Close(first[3]!, first[4]!); filesystem.Close(second[3]!, second[4]!);
        Assert(filesystem.ActiveHandles == 0, "A late Close double-counted a released descriptor.");
        Assert(filesystem.Open("held.bin", 0u, 0u, out _, out _, out _, out _) != 0, "A new open was admitted after the forced release.");
        Console.WriteLine("PASS forced release closes every held descriptor, a late Close is harmless and new opens stop");
    }

    static void BusyMessagesNameTheHolderKindAndOfferForceLock()
    {
        var cases = new (VaultFileSystem.HolderSummary Holders, string Expected)[]
        {
            (new(1, 1, 0, 0, 0, 0, 1), "reading or writing"),
            (new(1, 0, 1, 0, 0, 0, 0), "Windows Explorer"),
            (new(1, 0, 0, 1, 0, 0, 0), "Windows Search"),
            (new(1, 0, 0, 0, 1, 0, 0), "security scan"),
            (new(1, 0, 0, 0, 0, 0, 1), "A program still has files"),
            (new(1, 0, 0, 0, 0, 0, 0), "A program still has files"),
        };
        foreach (var (holders, expected) in cases)
        {
            var busy = DriveBusyException.From(holders);
            Assert(busy.Message.Contains(expected) && busy.Message.Contains("Force lock"), "Busy message did not name the holder kind and Force lock: " + busy.Message);
            Assert(busy.Holders.Length > 0 && !busy.Message.Contains('\\') && !busy.Message.Contains(".exe"), "Busy message carried a path or program name.");
        }
        Console.WriteLine("PASS ordinary lock busy messages name the kind of holder without paths and offer Force lock");
    }

    static async Task FlushJournalCommitsWithoutLocking(string root)
    {
        using var controller = Make(root, out var engine);
        engine.CreateFile("sleep.bin");
        engine.WriteRange("sleep.bin", 0, new byte[] { 4, 5, 6 });
        var result = JsonSerializer.SerializeToElement(await controller.DispatchAsync("flushJournal", default));
        Assert(result.GetProperty("flushed").GetBoolean(), "Journal flush did not report success.");
        Assert(engine.JournalStatistics.PendingFrames == 0 || engine.JournalStatistics.AppendedFrames > 0, "Journal was not committed.");
        Assert(Field<object?>(controller, "vault") is not null, "Journal flush locked the vault.");
        Console.WriteLine("PASS journal flush commits without locking, for use before the machine suspends");
    }
}
