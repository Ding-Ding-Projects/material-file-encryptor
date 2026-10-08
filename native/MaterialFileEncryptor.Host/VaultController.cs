using Fsp;
using MaterialFileEncryptor.Core;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal sealed class VaultController : IDisposable
{
    private readonly object gate = new();
    private VaultEngine? vault;
    private FileSystemHost? host;
    private VaultFileSystem? fileSystem;
    private string? storageDir, cacheDir, identity;
    private string driveLetter = "M:";
    private string? syncError;
    private DateTimeOffset? lastSync;
    private object? lastOfflineRelease;
    private bool syncing, unmountBusy;
    private readonly bool driverAvailable;
    private readonly string? driverError;
    private readonly string? driverReason;
    private readonly string? driverNtStatus;

    public VaultController()
    {
        if (!OperatingSystem.IsWindows()) { driverReason = "windows-required"; driverError = "Explorer drive mounting requires Windows and the official WinFsp driver."; return; }
        try
        {
            using var probe = new FileSystemHost(new FileSystemBase());
            int result = probe.Preflight(null!);
            driverAvailable = result >= 0;
            if (!driverAvailable)
            {
                driverReason = "preflight-failed";
                driverNtStatus = "0x" + unchecked((uint)result).ToString("X8");
                driverError = "The WinFsp driver could not start or open its filesystem device. Check the official signed WinFsp installation and restart Windows if installation requested it.";
            }
        }
        catch (Exception error)
        {
            while (error.InnerException is not null) error = error.InnerException;
            driverReason = error switch
            {
                DllNotFoundException => "native-library-missing",
                BadImageFormatException => "native-library-architecture-mismatch",
                EntryPointNotFoundException => "native-entry-point-missing",
                TypeLoadException => "native-binding-version-mismatch",
                _ => "native-binding-initialization-failed"
            };
            driverError = "The WinFsp native library could not initialize. Install the official signed WinFsp 2.1 release and restart the application.";
        }
    }
    private VaultEngine Engine => vault ?? throw new InvalidOperationException("Unlock the vault first.");
    public object Status()
    {
        lock (gate)
        {
            var files = new List<object>();
            if (vault is not null) CollectFiles("", files);
            return new
            {
                locked = vault is null, mounted = host is not null, unmountBusy, driveLetter, storageDir, cacheDir, files,
                partSizeBytes = vault?.PartSizeBytes ?? 10L * 1024 * 1024, lastOfflineRelease,
                sync = new { running = syncing, lastSync, error = fileSystem?.LastError ?? syncError ?? (vault?.Status.LastError is null ? null : "Encrypted storage synchronization needs attention."), pendingCommits = vault?.Status.PendingCommits ?? 0, sourceAvailable = vault?.Status.IsSourceAvailable ?? false },
                driver = new
                {
                    available = driverAvailable, error = driverError,
                    diagnostic = new
                    {
                        reason = driverReason, ntStatus = driverNtStatus,
                        processArchitecture = RuntimeInformation.ProcessArchitecture.ToString(),
                        nativeLibraryExpected = RuntimeInformation.ProcessArchitecture switch { Architecture.Arm64 => "winfsp-a64.dll", Architecture.X86 => "winfsp-x86.dll", _ => "winfsp-x64.dll" },
                        bindingProduct = typeof(FileSystemHost).Assembly.GetCustomAttribute<AssemblyProductAttribute>()?.Product,
                        bindingVersion = FileVersionInfo.GetVersionInfo(typeof(FileSystemHost).Assembly.Location).FileVersion
                    }
                },
                autoUnlock = identity is not null && SavedCredentialStore.Exists(identity),
                availableDriveLetters = FreeDriveLetters()
            };
        }
    }
    private void CollectFiles(string parent, List<object> output)
    {
        foreach (var entry in Engine.Enumerate(parent))
        {
            if (entry.IsDirectory) { CollectFiles(entry.Path, output); continue; }
            output.Add(new { id = entry.EntryId, path = entry.Path, size = entry.Length, modified = entry.ModifiedUtc, partCount = entry.PartCount, partSizeBytes = entry.PartSizeBytes, offline = entry.IsPinned });
        }
    }
    private static string[] FreeDriveLetters()
    {
        if (!OperatingSystem.IsWindows()) return [];
        var occupied = DriveInfo.GetDrives().Select(x => char.ToUpperInvariant(x.Name[0])).ToHashSet();
        return Enumerable.Range('D', 23).Select(x => (char)x).Where(x => !occupied.Contains(x)).Select(x => x + ":").ToArray();
    }
    public object? Execute(string method, JsonElement args)
    {
        // Dispatcher stop waits for callbacks. It must run outside the callback gate.
        if (method is "lock" or "unmount") { Unmount(); if (method == "lock") LockEngine(); return Status(); }
        lock (gate)
        {
            switch (method)
            {
                case "status": return Status();
                case "create": Open(args, true, false); break;
                case "unlock": Open(args, false, false); break;
                case "autoUnlock": Open(args, false, true); break;
                case "mount": Mount(args); break;
                case "importFiles": Import(args); break;
                case "keepOffline": Engine.SetPinnedAsync(RequiredString(args, "path"), true).GetAwaiter().GetResult(); break;
                case "releaseOffline":
                    string releasedPath = VaultPath.Normalize(RequiredString(args, "path"));
                    Engine.SetPinnedAsync(releasedPath, false).GetAwaiter().GetResult();
                    lastOfflineRelease = new { path = releasedPath, bytesFreed = Engine.EvictEntryCache(releasedPath) };
                    break;
                case "setPartSize": Engine.SetPartSize(RequiredLong(args, "partSizeBytes")); Engine.FlushAsync().GetAwaiter().GetResult(); break;
                case "resplit": Engine.ResplitAsync(RequiredString(args, "path"), RequiredLong(args, "partSizeBytes")).GetAwaiter().GetResult(); break;
                case "sync": SyncLocked(); break;
                case "forgetSavedCredential": Forget(args); break;
                case "setAutoUnlock":
                    if (OptionalBool(args, "enabled")) SaveCredential(); else Forget(args);
                    break;
                default: throw new ArgumentException("Unknown helper method.");
            }
            return Status();
        }
    }
    private void Open(JsonElement args, bool create, bool automatic)
    {
        if (vault is not null) throw new InvalidOperationException("Lock the current vault before opening another.");
        var options = new VaultOptions { StorageRoot = System.IO.Path.GetFullPath(RequiredString(args, "storageDir")), CacheRoot = System.IO.Path.GetFullPath(RequiredString(args, "cacheDir")), PartSizeBytes = OptionalLong(args, "partSizeBytes") ?? 10L * 1024 * 1024 };
        string chosenDrive = ValidateDrive(OptionalString(args, "driveLetter") ?? driveLetter);
        VaultEngine opened;
        if (automatic)
        {
            string vaultIdentity = SavedCredentialStore.ReadVaultIdentity(options.StorageRoot, options.CacheRoot);
            byte[] key = SavedCredentialStore.Load(vaultIdentity);
            try { opened = VaultEngine.OpenWithMasterKey(options, key); }
            finally { CryptographicOperations.ZeroMemory(key); }
        }
        else
        {
            string? password = OptionalString(args, "password"), keyPath = OptionalString(args, "keyFilePath");
            if ((password is null) == (keyPath is null)) throw new ArgumentException("Choose either a password or a key file.");
            VaultCredentials credential;
            if (keyPath is not null)
            {
                string resolved = System.IO.Path.GetFullPath(keyPath);
                if (IsWithin(resolved, options.StorageRoot) || IsWithin(resolved, options.CacheRoot)) throw new ArgumentException("The key file must be outside encrypted storage and cache folders.");
                using var input = File.OpenRead(resolved);
                if (input.Length is < 32 or > 1048576) throw new ArgumentException("A key file must contain 32 bytes to 1 MiB.");
                var key = new byte[(int)input.Length]; input.ReadExactly(key);
                try { credential = VaultCredentials.KeyFile(key); }
                finally { CryptographicOperations.ZeroMemory(key); }
            }
            else credential = VaultCredentials.Password(password!);
            using (credential) opened = create ? VaultEngine.Create(options, credential) : VaultEngine.Open(options, credential);
        }
        vault = opened; storageDir = options.StorageRoot; cacheDir = options.CacheRoot; identity = opened.VaultId; driveLetter = chosenDrive;
        syncError = null; unmountBusy = false; lastOfflineRelease = null;
        if (OptionalBool(args, "autoUnlock")) SaveCredential();
        // Unlock and mount are separate operations; a missing driver never prevents
        // inspection/import/sync of an authenticated vault.
    }
    private void Mount(JsonElement args)
    {
        _ = Engine;
        if (host is not null) return;
        if (!driverAvailable) throw new InvalidOperationException(driverError);
        string selected = ValidateDrive(OptionalString(args, "driveLetter") ?? driveLetter);
        if (!FreeDriveLetters().Contains(selected, StringComparer.OrdinalIgnoreCase)) throw new InvalidOperationException("That drive letter is already in use.");
        var adapter = new VaultFileSystem(Engine, gate);
        var mountedHost = new FileSystemHost(adapter);
        try
        {
            int result = mountedHost.Preflight(selected);
            if (result < 0) throw new InvalidOperationException("WinFsp could not reserve the selected drive letter.");
            result = mountedHost.Mount(selected, null!, true, 0);
            if (result < 0) throw new InvalidOperationException("WinFsp could not mount the encrypted drive. Check the driver installation and drive letter.");
            host = mountedHost; fileSystem = adapter; driveLetter = selected; unmountBusy = false;
        }
        catch { mountedHost.Dispose(); throw; }
    }
    public void Unmount()
    {
        FileSystemHost? mountedHost;
        lock (gate)
        {
            mountedHost = host;
            if (mountedHost is null) { unmountBusy = false; return; }
            if (fileSystem is null || !fileSystem.BeginUnmount()) { unmountBusy = true; throw new InvalidOperationException("The drive is busy. Close files and Explorer windows using it, then try again."); }
        }
        try { mountedHost.Unmount(); }
        catch { lock (gate) fileSystem?.CancelUnmount(); throw; }
        lock (gate) { host = null; fileSystem = null; unmountBusy = false; }
    }
    private void LockEngine()
    {
        lock (gate)
        {
            if (host is not null) throw new InvalidOperationException("Unmount the drive before locking.");
            if (vault is null) return;
            vault.FlushAsync().GetAwaiter().GetResult();
            vault.Dispose(); vault = null; syncError = null;
        }
    }
    private void SaveCredential()
    {
        byte[] key = Engine.ExportMasterKey();
        try { SavedCredentialStore.Save(Engine.VaultId, key); }
        finally { CryptographicOperations.ZeroMemory(key); }
    }
    private void Forget(JsonElement args)
    {
        string id = identity ?? SavedCredentialStore.ReadVaultIdentity(RequiredString(args, "storageDir"), RequiredString(args, "cacheDir"));
        SavedCredentialStore.Forget(id);
    }
    private void Import(JsonElement args)
    {
        if (!args.TryGetProperty("paths", out var paths) || paths.ValueKind != JsonValueKind.Array) throw new ArgumentException("Select files to import.");
        foreach (var pathElement in paths.EnumerateArray())
        {
            string sourcePath = System.IO.Path.GetFullPath(pathElement.GetString() ?? throw new ArgumentException("Invalid import path."));
            if (IsWithin(sourcePath, storageDir!) || IsWithin(sourcePath, cacheDir!)) throw new ArgumentException("Choose an original file outside the encrypted storage and cache folders.");
            string name = VaultPath.Normalize(System.IO.Path.GetFileName(sourcePath));
            string candidate = name;
            for (int suffix = 2; Engine.GetInfo(candidate) is not null; suffix++) candidate = System.IO.Path.GetFileNameWithoutExtension(name) + " (" + suffix + ")" + System.IO.Path.GetExtension(name);
            using var input = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.Read, 65536, FileOptions.SequentialScan);
            byte[] buffer = new byte[65536];
            Engine.CreateFile(candidate);
            try
            {
                long offset = 0; int count;
                while ((count = input.Read(buffer)) != 0) { Engine.WriteRange(candidate, offset, buffer.AsSpan(0, count)); offset += count; }
                Engine.SetBasicInfo(candidate, null, File.GetCreationTimeUtc(sourcePath), File.GetLastWriteTimeUtc(sourcePath));
                Engine.FlushAsync().GetAwaiter().GetResult();
            }
            catch { Engine.Delete(candidate); Engine.FlushAsync().GetAwaiter().GetResult(); throw; }
            finally { CryptographicOperations.ZeroMemory(buffer); }
        }
        SyncLocked();
    }
    public void SyncIfUnlocked()
    {
        lock (gate) { if (vault is not null) SyncLocked(); }
    }
    private void SyncLocked()
    {
        syncing = true;
        try { fileSystem?.RecoverPending(); Engine.SyncAsync().GetAwaiter().GetResult(); lastSync = DateTimeOffset.UtcNow; syncError = Engine.Status.LastError is null ? null : "Encrypted storage synchronization needs attention."; }
        catch { syncError = "Encrypted storage could not synchronize. Changes remain in the encrypted local cache."; throw; }
        finally { syncing = false; }
    }
    private static bool IsWithin(string child, string parent) => child.Equals(parent, StringComparison.OrdinalIgnoreCase) || child.StartsWith(parent.TrimEnd(System.IO.Path.DirectorySeparatorChar) + System.IO.Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    private static string ValidateDrive(string value)
    {
        value = value.Trim().TrimEnd('\\').ToUpperInvariant();
        if (value.Length != 2 || value[0] is < 'D' or > 'Z' || value[1] != ':') throw new ArgumentException("Choose a drive letter between D: and Z:.");
        return value;
    }
    private static string RequiredString(JsonElement args, string name) => OptionalString(args, name) is { Length: > 0 } value ? value : throw new ArgumentException("A required setting is missing.");
    private static string? OptionalString(JsonElement args, string name) => args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Null ? value.GetString() : null;
    private static bool OptionalBool(JsonElement args, string name) => args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.True;
    private static long RequiredLong(JsonElement args, string name) => OptionalLong(args, name) ?? throw new ArgumentException("A required number is missing.");
    private static long? OptionalLong(JsonElement args, string name) => args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var value) ? value.GetInt64() : null;
    public void Dispose() { Unmount(); LockEngine(); }
}
