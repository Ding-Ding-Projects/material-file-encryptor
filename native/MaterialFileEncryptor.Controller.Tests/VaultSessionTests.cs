using System.Collections;
using System.Reflection;
using System.Text.Json;

static partial class Regression
{
    static async Task MultiVaultSessions()
    {
        var assembly = Assembly.Load("MaterialFileEncryptor.Host");
        var brokerType = assembly.GetType("MaterialFileEncryptor.Host.VaultSessionBroker", true)!;
        object broker = Activator.CreateInstance(brokerType)!;
        string root = Path.Combine(Path.GetTempPath(), "mfe-sessions-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        Task<object?> Send(string method, object parameters)
        {
            try { return (Task<object?>)brokerType.GetMethod("DispatchAsync")!.Invoke(broker, new object[] { method, JsonSerializer.SerializeToElement(parameters) })!; }
            catch (TargetInvocationException error) { return Task.FromException<object?>(error.InnerException!); }
        }
        async Task Refused(string method, object parameters, string reason)
        {
            try { await Send(method, parameters); }
            catch (Exception error) when (error is InvalidOperationException or ArgumentException) { return; }
            throw new Exception(reason);
        }
        object Open(string sessionId, string folder, string driveLetter) => new { sessionId, storageDir = Path.Combine(root, folder, "source"), cacheDir = Path.Combine(root, folder, "cache"), password = "multi vault regression fixture", driveLetter };
        object Session(string id)
        {
            var sessions = (IDictionary)brokerType.GetField("sessions", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(broker)!;
            return sessions[id]!;
        }
        object Controller(string id)
        {
            object session = Session(id);
            return session.GetType().GetField("Controller")!.GetValue(session)!;
        }
        try
        {
            await Refused("status", new { sessionId = (string?)null }, "Explicit null session silently selected main");
            await Refused("status", new { sessionId = "" }, "Empty session silently selected main");
            await Refused("status", new { sessionId = 123 }, "Numeric session silently selected main");
            var pathsType = assembly.GetType("MaterialFileEncryptor.Host.VaultSessionPaths", true)!;
            string Canonical(string path) => (string)pathsType.GetMethod("Canonical")!.Invoke(null, new object[] { path })!;
            Assert(Canonical(Path.Combine(root, "missing", "..", "target")) == Canonical(Path.Combine(root, "target")), "Lexical folder aliases are not canonicalized");
            string existingFolder = Path.Combine(root, "physical"); Directory.CreateDirectory(existingFolder);
            if (!OperatingSystem.IsWindows())
            {
                string linked = Path.Combine(root, "linked"); Directory.CreateSymbolicLink(linked, existingFolder);
                try { Canonical(Path.Combine(linked, "nested")); throw new Exception("Linked folder was admitted"); }
                catch (TargetInvocationException error) when (error.InnerException is ArgumentException) { }
                Directory.Delete(linked);
            }
            var initial = JsonSerializer.SerializeToElement(await Send("listSessions", new { }));
            Assert(initial.GetArrayLength() == 1 && initial[0].GetProperty("sessionId").GetString() == "main", "Legacy default session missing");
            string second = JsonSerializer.SerializeToElement(await Send("createSession", new { })).GetProperty("sessionId").GetString()!;
            string third = JsonSerializer.SerializeToElement(await Send("createSession", new { })).GetProperty("sessionId").GetString()!;
            Assert(second != third && second != "main", "Session IDs are not unique");
            var mainController = Controller("main");
            var commandWorker = (SemaphoreSlim)ControllerType.GetField("commandWorker", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(mainController)!;
            await commandWorker.WaitAsync();
            Task<object?> first;
            try
            {
                first = Send("create", Open("main", "first", "M:"));
                // Admission waits for physical-path identification off the input
                // thread, then reserves before entering the controller queue.
                var admitted = ControllerType.GetField("queuedCommands", BindingFlags.Instance | BindingFlags.NonPublic)!;
                var deadline = DateTime.UtcNow.AddSeconds(10);
                while ((int)admitted.GetValue(mainController)! == 0 && !first.IsCompleted && DateTime.UtcNow < deadline) await Task.Delay(10);
                Assert((int)admitted.GetValue(mainController)! != 0, "Open never reached controller admission");
                await Refused("create", Open(second, "second", "m:"), "Queued admission did not reserve its drive letter");
                await Refused("create", Open(second, "first", "N:"), "Queued admission did not reserve storage and cache");
            }
            finally { commandWorker.Release(); }
            await first;
            await Send("create", Open(second, "second", "N:"));
            Assert(!ReferenceEquals(mainController, Controller(second)), "Vault sessions share a controller");
            object mainSession = Session("main");
            var repositories = (HashSet<string>)mainSession.GetType().GetField("Repositories")!.GetValue(mainSession)!;
            repositories.Add("fixture/private");
            await Refused("unlock", new { sessionId = third, storageDir = Path.Combine(root, "remote", "source"), cacheDir = Path.Combine(root, "remote", "cache"), transport = "privateGit", remoteRepository = "FIXTURE/PRIVATE.git", password = "fixture", driveLetter = "O:" }, "Same private repository was admitted in another session");
            repositories.Clear();
            if (OperatingSystem.IsWindows())
                await Refused("unlock", new { sessionId = third, storageDir = @"M:\nested", cacheDir = Path.Combine(root, "nested", "cache"), password = "fixture", driveLetter = "O:" }, "Storage inside an encrypted drive was admitted");
            await Refused("removeSession", new { sessionId = second }, "An unlocked session was removed");
            await Refused("unlock", new { sessionId = third, storageDir = Path.Combine(root, "first", "source", "nested"), cacheDir = Path.Combine(root, "third", "cache"), password = "fixture", driveLetter = "O:" }, "Nested storage collision was accepted");
            await Refused("unlock", new { sessionId = third, storageDir = Path.Combine(root, "third", "source"), cacheDir = Path.Combine(root, "second", "source"), password = "fixture", driveLetter = "O:" }, "Cross storage/cache collision was accepted");
            await Send("lock", new { sessionId = second });
            Assert(!JsonSerializer.SerializeToElement(await Send("status", new { })).GetProperty("locked").GetBoolean(), "Locking one session changed the default vault");
            // A late transport completion still owns its roots after the key has
            // been destroyed. It cannot overlap a second controller's unlock.
            Set(mainController, "syncFlight", 1);
            await Send("lock", new { });
            await Refused("unlock", Open(third, "first", "O:"), "Pending synchronization released folder ownership");
            Set(mainController, "syncFlight", 0);
            await Send("unlock", Open(third, "first", "O:"));
            await Refused("removeSession", new { sessionId = "main" }, "Default session could be removed");
            await Send("removeSession", new { sessionId = second });
            await Refused("status", new { sessionId = second }, "Removed session still accepted requests");
            await Send("lock", new { sessionId = third });
            // Failed opens with no surviving native ownership release admission.
            await Refused("unlock", new { sessionId = third, storageDir = Path.Combine(root, "bad", "source"), cacheDir = Path.Combine(root, "bad", "cache"), driveLetter = "P:" }, "Missing credentials were accepted");
            await Send("create", Open("main", "replacement", "P:"));
            await (Task)brokerType.GetMethod("ForceLockAllAsync")!.Invoke(broker, null)!;
            ((IDisposable)broker).Dispose();
            Console.WriteLine("PASS independent vault sessions, legacy routing, admission collisions, safe release, removal and shutdown");
        }
        finally
        {
            ((IDisposable)broker).Dispose();
            foreach (string path in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)) File.SetAttributes(path, FileAttributes.Normal);
            Directory.Delete(root, true);
        }
    }
}
