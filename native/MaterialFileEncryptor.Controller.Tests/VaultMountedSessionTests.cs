using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

static partial class Regression
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern uint QueryDosDevice(string name, StringBuilder target, int length);

    static bool UnassignedDrive(string drive)
    {
        if (DriveInfo.GetDrives().Any(item => item.Name.StartsWith(drive, StringComparison.OrdinalIgnoreCase))) return false;
        if (QueryDosDevice(drive, new StringBuilder(32768), 32768) != 0) return false;
        // Any error except ERROR_FILE_NOT_FOUND is ambiguous, never free.
        return Marshal.GetLastWin32Error() == 2;
    }

    // Opt-in only. Never called by the ordinary controller regression suite.
    // Uses existing WinFsp, random disposable fixtures, no saved credentials,
    // startup integration, driver installation, network transport or real vaults.
    static async Task MultiVaultMountedSessions()
    {
        Assert(OperatingSystem.IsWindows(), "Real mount verification requires Windows and existing WinFsp.");
        var type = Assembly.Load("MaterialFileEncryptor.Host").GetType("MaterialFileEncryptor.Host.VaultSessionBroker", true)!;
        var broker = Activator.CreateInstance(type)!;
        string root = Path.Combine(Path.GetTempPath(), "mfe-multi-mount-" + Guid.NewGuid().ToString("N"));
        var histories = new List<string>();
        var drives = new List<string>();
        Task<object?> Send(string method, object parameters)
        {
            try { return (Task<object?>)type.GetMethod("DispatchAsync")!.Invoke(broker, new object[] { method, JsonSerializer.SerializeToElement(parameters) })!; }
            catch (TargetInvocationException error) { return Task.FromException<object?>(error.InnerException!); }
        }
        async Task<JsonElement> Status(string id) => JsonSerializer.SerializeToElement(await Send("status", new { sessionId = id }));
        async Task Lock(string id)
        {
            var deadline = DateTime.UtcNow.AddSeconds(10);
            while (true)
            {
                try { await Send("lock", new { sessionId = id }); return; }
                catch (InvalidOperationException) when (DateTime.UtcNow < deadline) { await Task.Delay(100); }
            }
        }
        try
        {
            Assert((await Status("main")).GetProperty("driver").GetProperty("available").GetBoolean(), "Existing WinFsp unavailable; no installation attempted.");
            drives.AddRange(Enumerable.Range('D', 23).Reverse().Select(letter => $"{(char)letter}:").Where(UnassignedDrive).Take(2));
            Assert(drives.Count == 2, "Two unassigned drive letters are required.");
            Console.WriteLine($"Synthetic multi-mount fixture: {root}; unused letters {string.Join(", ", drives)}");
            Directory.CreateDirectory(root);
            string second = JsonSerializer.SerializeToElement(await Send("createSession", new { })).GetProperty("sessionId").GetString()!;
            string[] ids = { "main", second };
            byte[][] content = { RandomNumberGenerator.GetBytes(100003), RandomNumberGenerator.GetBytes(110017) };
            for (int i = 0; i < ids.Length; i++)
            {
                string storage = Path.Combine(root, $"vault-{i}", "source"), cache = Path.Combine(root, $"vault-{i}", "cache");
                string hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(storage.ToUpperInvariant() + "|folder|"))).ToLowerInvariant();
                string history = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MaterialFileEncryptor-Data", "History", hash);
                Assert(!Directory.Exists(history), "Unexpected pre-existing fixture history; aborting without touching it.");
                histories.Add(history);
                await Send("create", new { sessionId = ids[i], storageDir = storage, cacheDir = cache, password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)), driveLetter = drives[i], autoUnlock = false });
                Assert(UnassignedDrive(drives[i]), "Drive became occupied before mounting; aborting.");
                await Send("mount", new { sessionId = ids[i], driveLetter = drives[i] });
                File.WriteAllBytes(Path.Combine(drives[i] + "\\", "isolation.bin"), content[i]);
            }
            for (int i = 0; i < ids.Length; i++)
                Assert(File.ReadAllBytes(Path.Combine(drives[i] + "\\", "isolation.bin")).SequenceEqual(content[i]), "Concurrent mounted data crossed sessions.");
            using (var held = new FileStream(Path.Combine(drives[0] + "\\", "isolation.bin"), FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                bool rejected = false;
                try { await Send("lock", new { sessionId = "main" }); } catch (InvalidOperationException) { rejected = true; }
                Assert(rejected && !(await Status("main")).GetProperty("locked").GetBoolean(), "Busy mount did not preserve its session.");
                Assert(File.ReadAllBytes(Path.Combine(drives[1] + "\\", "isolation.bin")).SequenceEqual(content[1]), "Busy lock affected another session.");
            }
            await Lock("main");
            Assert(UnassignedDrive(drives[0]), "First drive remained assigned after lock.");
            Assert(File.ReadAllBytes(Path.Combine(drives[1] + "\\", "isolation.bin")).SequenceEqual(content[1]), "Locking the first drive affected the second.");
            await Lock(second);
            Assert(drives.All(UnassignedDrive), "Fixture drive letters were not released.");
            Console.WriteLine("PASS two simultaneous WinFsp mounts, distinct same-name data, busy-lock preservation, independent lock and drive release");
        }
        finally
        {
            await (Task)type.GetMethod("ForceLockAllAsync")!.Invoke(broker, null)!;
            ((IDisposable)broker).Dispose();
            // Never delete backing files while any selected letter remains in use.
            Assert(drives.All(UnassignedDrive), $"Drive ownership is uncertain. Fixture retained at {root}; no backing-file cleanup attempted.");
            foreach (string directory in histories.Prepend(root).Where(Directory.Exists))
            {
                foreach (string file in Directory.EnumerateFiles(directory, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal);
                Directory.Delete(directory, true);
            }
            Console.WriteLine("PASS synthetic fixture/history cleanup; no selected drive remains assigned");
        }
    }
}
