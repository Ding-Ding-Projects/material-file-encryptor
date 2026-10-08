using System.Security.Cryptography;
using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal static class WindowsSelfTest
{
    private static void Require(bool condition, string operation) { if (!condition) throw new InvalidOperationException("Filesystem self-test failed: " + operation); }
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value);
    private static void LockWhenIdle(VaultController controller)
    {
        var elapsed = System.Diagnostics.Stopwatch.StartNew();
        while (true)
        {
            try { controller.Execute("lock", Args(new { })); return; }
            catch (InvalidOperationException) when (elapsed.Elapsed < TimeSpan.FromSeconds(5)) { Thread.Sleep(50); }
        }
    }
    public static Task<int> RunAsync()
    {
        if (!OperatingSystem.IsWindows()) { Console.Out.WriteLine("{\"selfTest\":false,\"error\":\"The WinFsp filesystem self-test requires Windows.\"}"); return Task.FromResult(2); }
        string root = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "mfe-winfsp-test-" + Guid.NewGuid().ToString("N"));
        var controller = new VaultController();
        bool passed = false;
        string check = "driver";
        try
        {
            var status = JsonSerializer.SerializeToElement(controller.Status());
            Require(status.GetProperty("driver").GetProperty("available").GetBoolean(), "official WinFsp driver availability");
            string drive = status.GetProperty("availableDriveLetters").EnumerateArray().Select(x => x.GetString()!).Last();
            string storage = System.IO.Path.Combine(root, "storage"), cache = System.IO.Path.Combine(root, "cache");
            string password = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
            check = "create-mount";
            controller.Execute("create", Args(new { storageDir = storage, cacheDir = cache, driveLetter = drive, password, partSizeBytes = 131072 }));
            controller.Execute("mount", Args(new { driveLetter = drive }));
            string mounted = drive + "\\";
            byte[] content = RandomNumberGenerator.GetBytes(180013), edit = RandomNumberGenerator.GetBytes(70001);
            string folder = System.IO.Path.Combine(mounted, "Explorer fixture");
            Directory.CreateDirectory(folder);
            string file = System.IO.Path.Combine(folder, "example.bin");
            check = "create-write-read";
            File.WriteAllBytes(file, content);
            Require(File.ReadAllBytes(file).SequenceEqual(content), "create/write/read");
            check = "range-flush-extension-truncation-busy-unmount";
            using (var stream = new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.Read))
            {
                stream.Position = 65530; stream.Write(edit); stream.Flush(true);
                edit.CopyTo(content, 65530);
                stream.SetLength(content.Length + 8192); stream.Flush(true);
                var tail = new byte[8192]; stream.Position = content.Length; stream.ReadExactly(tail);
                Require(tail.All(x => x == 0), "zero-filled file extension");
                stream.SetLength(content.Length); stream.Flush(true);
                bool rejected = false;
                try { controller.Unmount(); } catch (InvalidOperationException) { rejected = true; }
                Require(rejected, "busy unmount preserves live handle");
            }
            Require(File.ReadAllBytes(file).SequenceEqual(content), "range edits and truncation");
            check = "memory-mapped-edit-and-busy-unmount";
            using (var mappedSource = new FileStream(file, FileMode.Open, FileAccess.ReadWrite, FileShare.ReadWrite))
            using (var mapping = System.IO.MemoryMappedFiles.MemoryMappedFile.CreateFromFile(mappedSource, null, content.LongLength, System.IO.MemoryMappedFiles.MemoryMappedFileAccess.ReadWrite, HandleInheritability.None, true))
            using (var view = mapping.CreateViewAccessor())
            {
                mappedSource.Dispose();
                content[0] ^= 0xFF;
                view.Write(0, content[0]); view.Flush();
                bool rejected = false;
                try { controller.Unmount(); } catch (InvalidOperationException) { rejected = true; }
                Require(rejected, "mapped view blocks unmount after the original file handle closed");
            }
            Require(File.ReadAllBytes(file).SequenceEqual(content), "memory-mapped edits");
            check = "share-modes";
            using (var exclusive = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.None))
            {
                bool denied = false;
                try { using var forbidden = File.OpenRead(file); } catch (IOException) { denied = true; }
                Require(denied, "kernel share-mode enforcement");
            }
            check = "replacement-open-handle";
            string target = System.IO.Path.Combine(folder, "replacement.bin");
            byte[] old = RandomNumberGenerator.GetBytes(99);
            File.WriteAllBytes(target, old);
            using (var oldHandle = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                File.Move(file, target, true);
                var readOld = new byte[old.Length]; oldHandle.ReadExactly(readOld);
                Require(readOld.SequenceEqual(old), "replacement preserves existing destination handle");
                Require(File.ReadAllBytes(target).SequenceEqual(content), "replacement publishes new content");
            }
            check = "directory-rename-open-child";
            string renamedFolder = System.IO.Path.Combine(mounted, "Renamed fixture");
            using (var openChild = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                Directory.Move(folder, renamedFolder);
                var first = new byte[100]; openChild.ReadExactly(first);
                Require(first.SequenceEqual(content[..100]), "directory rename retains child handle");
            }
            target = System.IO.Path.Combine(renamedFolder, "replacement.bin");
            Require(Directory.EnumerateFiles(renamedFolder).Count() == 1, "directory enumeration");
            check = "enumerate-sync-lock-reopen";
            controller.Execute("sync", Args(new { }));
            LockWhenIdle(controller);
            controller.Execute("unlock", Args(new { storageDir = storage, cacheDir = cache, driveLetter = drive, password }));
            controller.Execute("mount", Args(new { driveLetter = drive }));
            Require(File.ReadAllBytes(target).SequenceEqual(content), "lock and reopen retains edits");
            check = "delete-open-handle";
            using (var deleted = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                File.Delete(target);
                Require(!File.Exists(target), "delete removes namespace entry");
                var first = new byte[100]; deleted.ReadExactly(first);
                Require(first.SequenceEqual(content[..100]), "delete retains existing read handle");
            }
            check = "delete-directory";
            Directory.Delete(renamedFolder);
            Require(!Directory.Exists(renamedFolder), "empty directory deletion");
            check = "dpapi-unlock";
            controller.Execute("setAutoUnlock", Args(new { enabled = true }));
            LockWhenIdle(controller);
            controller.Execute("autoUnlock", Args(new { storageDir = storage, cacheDir = cache, driveLetter = drive }));
            controller.Execute("forgetSavedCredential", Args(new { }));
            LockWhenIdle(controller);
            passed = true;
            Console.Out.WriteLine("{\"selfTest\":true,\"filesystem\":\"WinFsp\",\"checks\":[\"create\",\"read\",\"range-write\",\"flush\",\"truncate\",\"share-modes\",\"busy-unmount\",\"mapped-view-unmount\",\"replace-open\",\"rename-directory\",\"enumerate\",\"reopen\",\"delete-open\",\"delete-directory\",\"dpapi-unlock\"]}");
        }
        catch (Exception error) { Console.Out.WriteLine(JsonSerializer.Serialize(new { selfTest = false, check, errorType = error.GetType().Name, error = "A real Windows filesystem operation failed. See the driver and encrypted-storage test documentation." })); }
        finally
        {
            try { controller.Execute("forgetSavedCredential", Args(new { })); } catch { }
            try { controller.Dispose(); } catch { }
            try { if (Directory.Exists(root)) Directory.Delete(root, true); } catch { }
        }
        return Task.FromResult(passed ? 0 : 1);
    }
}
