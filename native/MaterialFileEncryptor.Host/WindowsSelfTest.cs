using System.Security.Cryptography;
using System.Text.Json;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using System.Diagnostics;

namespace MaterialFileEncryptor.Host;

internal static class WindowsSelfTest
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetFileInformationByHandle(SafeFileHandle file, int informationClass, byte[] information, uint size);

    private static void PosixRename(string source, string target, bool directory = false)
    {
        // FILE_RENAME_INFO_EX has pointer alignment before RootDirectory on x64.
        // Windows 10+ class 22 and flags 3 request REPLACE_IF_EXISTS | POSIX_SEMANTICS.
        using var handle = CreateFileW(source, 0x00010000 /* DELETE */, 7 /* share read/write/delete */,
            IntPtr.Zero, 3 /* OPEN_EXISTING */, directory ? 0x02000000u /* BACKUP_SEMANTICS */ : 0, IntPtr.Zero);
        if (handle.IsInvalid) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        byte[] name = System.Text.Encoding.Unicode.GetBytes(System.IO.Path.GetFullPath(target));
        int lengthOffset = (IntPtr.Size == 8 ? 8 : 4) + IntPtr.Size, nameOffset = lengthOffset + 4;
        byte[] info = new byte[nameOffset + name.Length];
        BitConverter.GetBytes(3u).CopyTo(info, 0);
        BitConverter.GetBytes((uint)name.Length).CopyTo(info, lengthOffset);
        name.CopyTo(info, nameOffset);
        if (!SetFileInformationByHandle(handle, 22 /* FileRenameInfoEx */, info, (uint)info.Length))
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    private static void RequireCrossProcessFilesystem(string drive)
    {
        string root = drive + "\\";
        // Only the public mounted root is passed to a child. The child performs
        // ordinary Windows filesystem I/O under its inherited user identity.
        const string script = "& { param([string]$root) $ErrorActionPreference='Stop'; $target=Join-Path $root 'cross-process-fixture.txt'; try { if (!(Test-Path -LiteralPath $root -PathType Container)) { throw 'root'; }; $data='Synthetic inherited-process filesystem fixture'; [System.IO.File]::WriteAllText($target,$data); if ([System.IO.File]::ReadAllText($target) -ne $data) { throw 'read'; }; [System.IO.File]::Delete($target); [Console]::Out.WriteLine('cross-process-ok'); exit 0 } catch { [Console]::Out.WriteLine('cross-process-failed'); exit 1 } }";
        var start = new ProcessStartInfo
        {
            FileName = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell", "v1.0", "powershell.exe"),
            UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true
        };
        foreach (string argument in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script, root }) start.ArgumentList.Add(argument);
        using var child = Process.Start(start) ?? throw new InvalidOperationException("Cross-process filesystem probe could not start.");
        var stdout = child.StandardOutput.ReadToEndAsync();
        var stderr = child.StandardError.ReadToEndAsync();
        if (!child.WaitForExit(20000)) { child.Kill(entireProcessTree: true); throw new InvalidOperationException("Cross-process filesystem probe exceeded its bounded lifetime."); }
        string output = stdout.GetAwaiter().GetResult().Trim();
        _ = stderr.GetAwaiter().GetResult();
        Require(child.ExitCode == 0 && output == "cross-process-ok", "normal inherited process can stat, write, read, and delete on mounted drive");
    }
    private static void RequireLegacyBusyReplacementDenied(string source, string target, byte[] sourceContent, byte[] targetContent)
    {
        using var handle = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
        bool denied = false;
        try { File.Move(source, target, true); }
        catch (UnauthorizedAccessException) { denied = true; }
        Require(denied, "legacy replacement of open destination is denied");
        Require(File.ReadAllBytes(source).SequenceEqual(sourceContent), "denied rename preserves source bytes");
        Require(File.ReadAllBytes(target).SequenceEqual(targetContent), "denied rename preserves destination bytes");
        var heldContent = new byte[targetContent.Length]; handle.ReadExactly(heldContent);
        Require(heldContent.SequenceEqual(targetContent), "denied rename preserves destination read handle");
    }
    private static void Require(bool condition, string operation) { if (!condition) throw new InvalidOperationException("Filesystem self-test failed: " + operation); }
    private static JsonElement Args(object value) => JsonSerializer.SerializeToElement(value);
    private static JsonElement Status(VaultController controller) => Args(controller.Status());
    private static JsonElement FileStatus(VaultController controller, string path) => Status(controller).GetProperty("files").EnumerateArray().Single(x => x.GetProperty("path").GetString() == path);
    private static HashSet<string> PartFiles(params string[] roots) => roots.SelectMany(root => Directory.EnumerateFiles(System.IO.Path.Combine(root, "parts"), "*.mfe")).ToHashSet(StringComparer.OrdinalIgnoreCase);
    private static void RequireNewPartCap(HashSet<string> before, long cap, params string[] roots)
    {
        var added = PartFiles(roots).Except(before).ToArray();
        Require(added.Length > 0, "operation produced encrypted parts");
        Require(added.All(path => new FileInfo(path).Length <= cap), "physical encrypted part size includes record overhead");
    }
    private static void RequireCiphertextCache(string cache, ReadOnlySpan<byte> plaintextMarker)
    {
        Require(Directory.EnumerateFiles(System.IO.Path.Combine(cache, "parts"), "*.mfe").Any(), "encrypted offline parts exist");
        foreach (string path in Directory.EnumerateFiles(cache, "*", SearchOption.AllDirectories))
            Require(File.ReadAllBytes(path).AsSpan().IndexOf(plaintextMarker) < 0, "generated plaintext marker is absent from persistent cache");
    }
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
            check = "cross-process-mounted-filesystem";
            RequireCrossProcessFilesystem(drive);
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
            check = "legacy-local-filesystem-baseline";
            string localSource = System.IO.Path.Combine(root, "local-source.bin"), localTarget = System.IO.Path.Combine(root, "local-target.bin");
            byte[] old = RandomNumberGenerator.GetBytes(99);
            File.WriteAllBytes(localSource, content); File.WriteAllBytes(localTarget, old);
            RequireLegacyBusyReplacementDenied(localSource, localTarget, content, old);
            File.Delete(localSource); File.Delete(localTarget);
            check = "ordinary-closed-target-replacement";
            string target = System.IO.Path.Combine(folder, "replacement.bin");
            string closedSource = System.IO.Path.Combine(folder, "closed-replacement.bin");
            File.WriteAllBytes(target, RandomNumberGenerator.GetBytes(99));
            File.WriteAllBytes(closedSource, old);
            File.Move(closedSource, target, true);
            Require(!File.Exists(closedSource) && File.ReadAllBytes(target).SequenceEqual(old), "ordinary closed-target replacement publishes source bytes");
            check = "legacy-busy-target-replacement-denied";
            RequireLegacyBusyReplacementDenied(file, target, content, old);
            check = "posix-replacement-open-handle";
            using (var oldHandle = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                PosixRename(file, target);
                var readOld = new byte[old.Length]; oldHandle.ReadExactly(readOld);
                Require(readOld.SequenceEqual(old), "replacement preserves existing destination handle");
                Require(!File.Exists(file) && File.ReadAllBytes(target).SequenceEqual(content), "POSIX replacement publishes new content");
            }
            check = "posix-directory-rename-open-child";
            string renamedFolder = System.IO.Path.Combine(mounted, "Renamed fixture");
            using (var openChild = new FileStream(target, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                PosixRename(folder, renamedFolder, true);
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
            string relativeTarget = "Renamed fixture/replacement.bin";
            check = "physical-part-cap-future-and-edited-files";
            Require(PartFiles(storage, cache).All(path => new FileInfo(path).Length <= 131072), "initial encrypted parts obey physical cap");
            Require(FileStatus(controller, relativeTarget).GetProperty("partCount").GetInt32() > 1, "initial fixture is physically split");
            foreach (long cap in new[] { 1024L, 1024L * 1024, 1024L * 1024 * 1024 })
            {
                controller.Execute("setPartSize", Args(new { partSizeBytes = cap }));
                Require(Status(controller).GetProperty("partSizeBytes").GetInt64() == cap, "KiB MiB and GiB cap values are accepted");
                Require(FileStatus(controller, relativeTarget).GetProperty("partSizeBytes").GetInt64() == 131072, "changing default does not resplit an untouched file");
            }
            controller.Execute("setPartSize", Args(new { partSizeBytes = 8192 }));
            string future = System.IO.Path.Combine(mounted, "future-cap.bin");
            byte[] futureContent = RandomNumberGenerator.GetBytes(24017);
            var partsBefore = PartFiles(storage, cache);
            File.WriteAllBytes(future, futureContent);
            controller.Execute("sync", Args(new { }));
            RequireNewPartCap(partsBefore, 8192, storage, cache);
            Require(FileStatus(controller, "future-cap.bin").GetProperty("partSizeBytes").GetInt64() == 8192, "new file uses new part cap");
            partsBefore = PartFiles(storage, cache);
            using (var stream = new FileStream(target, FileMode.Open, FileAccess.Write, FileShare.Read))
            {
                content[^1] ^= 0xFF; stream.Position = content.Length - 1; stream.WriteByte(content[^1]); stream.Flush(true);
            }
            controller.Execute("sync", Args(new { }));
            RequireNewPartCap(partsBefore, 8192, storage, cache);
            Require(FileStatus(controller, relativeTarget).GetProperty("partSizeBytes").GetInt64() == 8192, "edited file adopts new part cap");
            Require(File.ReadAllBytes(target).SequenceEqual(content), "cap transition preserves file bytes");
            check = "explicit-resplit-existing-file";
            partsBefore = PartFiles(storage, cache);
            controller.Execute("resplit", Args(new { path = "future-cap.bin", partSizeBytes = 4096 }));
            RequireNewPartCap(partsBefore, 4096, storage, cache);
            Require(FileStatus(controller, "future-cap.bin").GetProperty("partSizeBytes").GetInt64() == 4096, "explicit resplit changes existing file cap");
            Require(FileStatus(controller, "future-cap.bin").GetProperty("partCount").GetInt32() > 1, "explicit resplit creates multiple parts");
            Require(Status(controller).GetProperty("partSizeBytes").GetInt64() == 8192, "explicit resplit preserves future-file default");
            LockWhenIdle(controller);
            controller.Execute("unlock", Args(new { storageDir = storage, cacheDir = cache, driveLetter = drive, password }));
            controller.Execute("mount", Args(new { driveLetter = drive }));
            Require(File.ReadAllBytes(future).SequenceEqual(futureContent), "resplit bytes survive fresh mounted reopen");
            File.Delete(future);
            controller.Execute("sync", Args(new { }));
            check = "pinned-ciphertext-cache-offline-mounted-read";
            controller.Execute("keepOffline", Args(new { path = relativeTarget }));
            Require(FileStatus(controller, relativeTarget).GetProperty("offline").GetBoolean(), "pin is recorded");
            RequireCiphertextCache(cache, content.AsSpan(0, 64));
            LockWhenIdle(controller);
            string unavailableStorage = storage + "-unavailable";
            Directory.Move(storage, unavailableStorage);
            try
            {
                // Reopening the mount prevents the Windows data cache from proving the read for us.
                controller.Execute("unlock", Args(new { storageDir = storage, cacheDir = cache, driveLetter = drive, password }));
                controller.Execute("mount", Args(new { driveLetter = drive }));
                Require(!Status(controller).GetProperty("sync").GetProperty("sourceAvailable").GetBoolean(), "backing storage is offline");
                Require(FileStatus(controller, relativeTarget).GetProperty("offline").GetBoolean(), "pin survives reopen");
                Require(File.ReadAllBytes(target).SequenceEqual(content), "pinned content is readable through fresh mount without storage");
                check = "copy-outside-drive-plaintext";
                string exported = System.IO.Path.Combine(root, "synthetic-export.bin");
                File.Copy(target, exported);
                Require(File.ReadAllBytes(exported).SequenceEqual(content), "copying outside the drive intentionally exports plaintext");
                File.Delete(exported);
                check = "offline-edit-unpin-dirty-reopen";
                using (var stream = new FileStream(target, FileMode.Open, FileAccess.Write, FileShare.Read))
                {
                    content[1] ^= 0xFF; stream.Position = 1; stream.WriteByte(content[1]); stream.Flush(true);
                }
                controller.Execute("releaseOffline", Args(new { path = relativeTarget }));
                Require(!FileStatus(controller, relativeTarget).GetProperty("offline").GetBoolean(), "release removes pin");
                Require(Status(controller).GetProperty("sync").GetProperty("pendingCommits").GetInt32() > 0, "offline edits remain queued");
                RequireCiphertextCache(cache, content.AsSpan(0, 64));
                LockWhenIdle(controller);
                controller.Execute("unlock", Args(new { storageDir = storage, cacheDir = cache, driveLetter = drive, password }));
                controller.Execute("mount", Args(new { driveLetter = drive }));
                Require(File.ReadAllBytes(target).SequenceEqual(content), "unpin retains dirty encrypted data across offline reopen");
                LockWhenIdle(controller);
            }
            finally { Directory.Move(unavailableStorage, storage); }
            check = "offline-reconnect-publish-fresh-cache";
            controller.Execute("unlock", Args(new { storageDir = storage, cacheDir = cache, driveLetter = drive, password }));
            controller.Execute("sync", Args(new { }));
            Require(Status(controller).GetProperty("sync").GetProperty("pendingCommits").GetInt32() == 0, "reconnection publishes queued changes");
            LockWhenIdle(controller);
            controller.Execute("unlock", Args(new { storageDir = storage, cacheDir = System.IO.Path.Combine(root, "fresh-cache"), driveLetter = drive, password }));
            controller.Execute("mount", Args(new { driveLetter = drive }));
            Require(File.ReadAllBytes(target).SequenceEqual(content), "fresh cache reads offline edits from restored storage");
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
            check = "keyfile-create-mounted-write";
            string keyStorage = System.IO.Path.Combine(root, "key-storage"), keyCache = System.IO.Path.Combine(root, "key-cache");
            string keyFile = System.IO.Path.Combine(root, "synthetic-key.bin"), wrongKeyFile = System.IO.Path.Combine(root, "wrong-synthetic-key.bin");
            byte[] keyBytes = RandomNumberGenerator.GetBytes(64), wrongKeyBytes = RandomNumberGenerator.GetBytes(64);
            try { File.WriteAllBytes(keyFile, keyBytes); File.WriteAllBytes(wrongKeyFile, wrongKeyBytes); }
            finally { CryptographicOperations.ZeroMemory(keyBytes); CryptographicOperations.ZeroMemory(wrongKeyBytes); }
            controller.Execute("create", Args(new { storageDir = keyStorage, cacheDir = keyCache, driveLetter = drive, keyFilePath = keyFile, partSizeBytes = 8192, autoUnlock = false }));
            Require(!Status(controller).GetProperty("autoUnlock").GetBoolean(), "keyfile vault does not save auto-unlock by default");
            controller.Execute("mount", Args(new { driveLetter = drive }));
            string keyTarget = System.IO.Path.Combine(mounted, "keyfile-fixture.bin");
            byte[] keyContent = RandomNumberGenerator.GetBytes(19003);
            File.WriteAllBytes(keyTarget, keyContent);
            LockWhenIdle(controller);
            check = "keyfile-wrong-key-rejected-and-reopen";
            bool wrongKeyRejected = false;
            try { controller.Execute("unlock", Args(new { storageDir = keyStorage, cacheDir = keyCache, driveLetter = drive, keyFilePath = wrongKeyFile })); }
            catch (CryptographicException) { wrongKeyRejected = true; }
            Require(wrongKeyRejected && Status(controller).GetProperty("locked").GetBoolean(), "wrong key file cannot unlock vault");
            controller.Execute("unlock", Args(new { storageDir = keyStorage, cacheDir = keyCache, driveLetter = drive, keyFilePath = keyFile }));
            controller.Execute("mount", Args(new { driveLetter = drive }));
            Require(File.ReadAllBytes(keyTarget).SequenceEqual(keyContent), "keyfile credential reopens mounted file");
            check = "keyfile-optional-current-user-dpapi";
            controller.Execute("setAutoUnlock", Args(new { enabled = true }));
            Require(Status(controller).GetProperty("autoUnlock").GetBoolean(), "explicit opt-in saves current-user credential");
            LockWhenIdle(controller);
            File.Delete(keyFile);
            controller.Execute("autoUnlock", Args(new { storageDir = keyStorage, cacheDir = keyCache, driveLetter = drive }));
            controller.Execute("mount", Args(new { driveLetter = drive }));
            Require(File.ReadAllBytes(keyTarget).SequenceEqual(keyContent), "current-user DPAPI reopens keyfile vault without original key file");
            controller.Execute("forgetSavedCredential", Args(new { }));
            Require(!Status(controller).GetProperty("autoUnlock").GetBoolean(), "forget removes saved current-user credential");
            LockWhenIdle(controller);
            bool forgottenRejected = false;
            try { controller.Execute("autoUnlock", Args(new { storageDir = keyStorage, cacheDir = keyCache, driveLetter = drive })); }
            catch (FileNotFoundException) { forgottenRejected = true; }
            Require(forgottenRejected && Status(controller).GetProperty("locked").GetBoolean(), "forgotten auto-unlock cannot reopen vault");
            passed = true;
            Console.Out.WriteLine("{\"selfTest\":true,\"filesystem\":\"WinFsp\",\"checks\":[\"create\",\"cross-process-filesystem\",\"read\",\"range-write\",\"flush\",\"truncate\",\"share-modes\",\"busy-unmount\",\"mapped-view-unmount\",\"replace-open\",\"rename-directory\",\"enumerate\",\"reopen\",\"delete-open\",\"delete-directory\",\"dpapi-unlock\",\"physical-part-cap\",\"future-and-edited-cap\",\"explicit-resplit\",\"pinned-offline-mounted-read\",\"ciphertext-cache\",\"copy-outside-plaintext\",\"offline-unpin-dirty-reopen\",\"offline-reconnect-fresh-cache\",\"keyfile-create-reopen\",\"wrong-keyfile\",\"keyfile-optional-dpapi\",\"forget-auto-unlock\",\"legacy-local-baseline\",\"closed-target-replace\",\"legacy-busy-replace-denied\",\"posix-open-replace\",\"posix-directory-open-child\"]}");
        }
        catch (Exception error) { Console.Out.WriteLine(JsonSerializer.Serialize(new { selfTest = false, check, errorType = error.GetType().Name, driver = JsonSerializer.SerializeToElement(controller.Status()).GetProperty("driver"), mountDiagnostic = Status(controller).GetProperty("mountDiagnostic"), error = "A real Windows filesystem operation failed. See the driver and encrypted-storage test documentation." })); }
        finally
        {
            try { controller.Execute("forgetSavedCredential", Args(new { })); } catch { }
            try { controller.Dispose(); } catch { }
            try { if (Directory.Exists(root)) Directory.Delete(root, true); } catch { }
        }
        return Task.FromResult(passed ? 0 : 1);
    }
}
