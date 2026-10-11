using Fsp;
using MaterialFileEncryptor.Core;
using System.Security.Cryptography;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal sealed partial class VaultController : IDisposable
{
    private readonly object gate = new();
    private VaultEngine? vault;
    private FileSystemHost? host;
    private VaultFileSystem? fileSystem;
    private string? storageDir, cacheDir, identity;
    private string driveLetter = "M:";
    private string? registeredDriveLetter;
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint QueryDosDeviceW(string deviceName, StringBuilder targetPath, uint maximum);
    private object MountDiagnostic()
    {
        if (!OperatingSystem.IsWindows() || host is null) return new { requestedDriveLetter = driveLetter, registeredDriveLetter, dosDeviceFound = false, win32Error = (int?)null };
        // This inspects the DOS namespace only; it never enters a filesystem
        // callback while the controller gate is held. Device target paths are not emitted.
        var target = new StringBuilder(4096);
        uint length = QueryDosDeviceW(driveLetter, target, (uint)target.Capacity);
        return new { requestedDriveLetter = driveLetter, registeredDriveLetter, dosDeviceFound = length != 0, win32Error = length == 0 ? (int?)Marshal.GetLastWin32Error() : null };
    }
    private string? syncError;
    private DateTimeOffset? lastSync;
    private object? lastOfflineRelease;
    private bool syncing, unmountBusy;
    private int syncFlight, activePreparedOperations;
    private long engineGeneration;
    private CancellationTokenSource? syncCancellation;
    private int? historyRetentionDays;
    private string transportMode = "folder";
    private string? remoteRepository;
    private IVaultTransport? transport;
    private bool transportAvailable, pendingPrivatePublication;
    private Func<VaultOptions, string, string, (IVaultTransport Transport, GitVaultHistory History)>? privateTransportFactory = null;
    private GitVaultHistory? historyStore;
    private bool historyPending;
    private long historyRevision;
    private readonly SemaphoreSlim historyOperations = new(1, 1);
    private string? historySourceRoot;
    private DateTimeOffset nextSyncAttempt;
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
        if (!Monitor.TryEnter(gate)) return Volatile.Read(ref cachedStatus) ?? new { busy = true };
        try
        {
            RefreshFiles();
            var files = cachedFiles;
            long revision = Volatile.Read(ref historyRevision);
            if (revision != cachedHistoryRevision)
            {
                cachedVersionCount = vault?.ListVersions().Count ?? 0;
                cachedRecycledCount = vault?.ListDeleted().Count ?? 0;
                cachedHistoryRevision = revision;
            }
            if(refreshEnvironment||cachedEnvironmentIdentity!=identity||!ReferenceEquals(cachedEnvironmentHost,host))
            {
                cachedAutoUnlock=identity is not null&&SavedCredentialStore.Exists(identity);
                cachedMountDiagnostic=MountDiagnostic();
                cachedDriveLetters=FreeDriveLetters();cachedEnvironmentIdentity=identity;cachedEnvironmentHost=host;refreshEnvironment=false;
            }
            var snapshot = new
            {
                locked = vault is null, mounted = host is not null, unmountBusy, driveLetter, storageDir, cacheDir, files, revision = vault?.Revision ?? -1, filesRevision = vault?.Revision ?? -1, historyRevision = revision, operations = operations.Snapshot(),
                partSizeBytes = vault?.PartSizeBytes ?? 10L * 1024 * 1024, lastOfflineRelease, mountDiagnostic = cachedMountDiagnostic,
                sync = new { running = syncing, lastSync, error = fileSystem?.LastError ?? syncError ?? (vault?.Status.LastError is null ? null : "Encrypted storage synchronization needs attention."), pendingCommits = vault?.Status.PendingCommits ?? 0, pendingLocalFrames = vault?.JournalStatistics.PendingFrames ?? 0, sourceAvailable = vault?.Status.IsSourceAvailable ?? false },
                driver = cachedDriver ??= new
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
                autoUnlock = cachedAutoUnlock,
                history = new { versionCount = cachedVersionCount, recycledCount = cachedRecycledCount, pendingVersionCount = vault?.PendingVersionCount ?? 0, retentionDays = historyRetentionDays, gitAvailable = historyStore is not null },
                storageFormat = vault?.StorageFormat, journal = JournalInfo(),
                transport = new { mode = transportMode, remoteRepository, available = vault is not null && (transportMode == "privateGit" ? transportAvailable : vault.Status.IsSourceAvailable), pendingSynchronization = vault is not null && transportMode == "privateGit" && (pendingPrivatePublication || historyPending || vault.Status.PendingCommits > 0 || vault.JournalStatistics.PendingFrames > 0 || vault.PendingVersionCount > 0), lastError = syncError },
                availableDriveLetters = cachedDriveLetters
            };
            Volatile.Write(ref cachedStatus, snapshot);
            CacheSummary(snapshot);
            return snapshot;
        }
        finally { Monitor.Exit(gate); }
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
        if (method == "operations") return operations.Snapshot();
        if (method == "cancelOperation") return operations.Cancel(RequiredString(args, "operationId"));
        if (method == "forceLock") return ForceLock();
        if (method == "startImport") return StartImport(args);
        if (method == "exportVersion") return ExportVersionFile(args);
        if (method == "startExport") return StartExport(args);
        if (method == "listFiles") return ListFiles(args);
        if (method == "statusSummary") return StatusSummary();
        if (method == "getFile")
        {
            lock(gate)
            {
                var entry=Engine.GetInfoById(RequiredString(args,"entryId"));
                if(entry.IsDirectory||entry.Path.Length==0)throw new FileNotFoundException("Selected file no longer exists.");
                return new {id=entry.EntryId,path=entry.Path,size=entry.Length,modified=entry.ModifiedUtc,partCount=entry.PartCount,partSizeBytes=entry.PartSizeBytes,offline=entry.IsPinned};
            }
        }
        // Dispatcher stop waits for callbacks. It must run outside the callback gate.
        if (method is "lock" or "unmount") { Unmount(); if (method == "lock") LockEngine(); return Status(); }
        if (method == "sync") { SyncIfUnlocked(); return Status(); }
        if (method == "importFiles") { Import(args); SyncIfUnlocked(); return Status(); }
        if (method is "restoreVersion" or "restoreDeleted" or "keepOffline" or "resplit" or "previewVersion") return ExecutePrepared(method, args);
        if (method == "copyUpgrade")
        {
            Unmount();
            lock (gate)
            {
                if (Volatile.Read(ref syncFlight) != 0) { syncCancellation?.Cancel(); throw new InvalidOperationException("Synchronization is stopping. Wait before copying the vault."); }
            }
            return ExecutePrepared(method, args);
        }
        lock (gate)
        {
            switch (method)
            {
                case "status": return Status();
                case "create": Open(args, true, false); break;
                case "unlock": Open(args, false, false); break;
                case "autoUnlock": Open(args, false, true); break;
                case "mount": Mount(args); break;

                case "listVersions":
                    int? retention = args.ValueKind == JsonValueKind.Object && args.TryGetProperty("retentionDays", out var days) && days.ValueKind != JsonValueKind.Null ? days.GetInt32() : historyRetentionDays;
                    return Engine.ListVersions(OptionalString(args, "entryId"), retention).Select(VersionInfo).ToArray();
                case "listDeleted": return Engine.ListDeleted().Select(VersionInfo).ToArray();
                case "listActivity": return ActivityPage(Engine.ListActivity(new VaultActivityQuery(
                    EntryId: OptionalString(args,"entryId"), Action: OptionalString(args,"action"),
                    FromUtc: (OptionalString(args,"fromUtc") ?? OptionalString(args,"from")) is string from ? DateTimeOffset.Parse(from, System.Globalization.CultureInfo.InvariantCulture) : null,
                    ToUtc: (OptionalString(args,"toUtc") ?? OptionalString(args,"to")) is string to ? DateTimeOffset.Parse(to, System.Globalization.CultureInfo.InvariantCulture) : null,
                    Pattern: OptionalString(args,"pattern"), Cursor: OptionalString(args,"cursor"), Limit: checked((int)(OptionalLong(args,"limit") ?? 100)))));
                case "previewVersion": return PreviewInfo(Engine.PreviewVersion(RequiredString(args,"versionId")));
                case "listVersionLabels": return Engine.ListVersionLabels(RequiredString(args,"entryId"));
                case "labelVersion": Engine.LabelVersion(RequiredString(args,"versionId"), RequiredString(args,"label")); break;
                case "saveVersion": Engine.SaveVersionAsync(OptionalString(args, "path")).GetAwaiter().GetResult(); break;
                case "emptyRecycleBin": Engine.EmptyRecycleBinAsync().GetAwaiter().GetResult(); break;
                case "setHistoryRetention":
                    int? selectedRetention = args.TryGetProperty("days", out var period) && period.ValueKind != JsonValueKind.Null ? period.GetInt32() : null;
                    if (selectedRetention is < 1 or > 36500) throw new ArgumentException("Choose a history period between one and 36500 days, or forever.");
                    historyRetentionDays = selectedRetention;
                    break;
                case "releaseOffline":
                    string releasedPath = VaultPath.Normalize(RequiredString(args, "path"));
                    Engine.SetPinnedAsync(releasedPath, false).GetAwaiter().GetResult();
                    lastOfflineRelease = new { path = releasedPath, bytesFreed = Engine.EvictEntryCache(releasedPath) };
                    break;
                case "setPartSize": Engine.SetPartSize(RequiredLong(args, "partSizeBytes")); Engine.FlushAsync().GetAwaiter().GetResult(); break;

                case "forgetSavedCredential": Forget(args); break;
                case "setAutoUnlock":
                    if (OptionalBool(args, "enabled")) SaveCredential(); else Forget(args);
                    break;
                default: throw new ArgumentException("Unknown helper method.");
            }
            return Status();
        }
    }
    private object ExecutePrepared(string method, JsonElement args)
    {
        VaultEngine captured;
        lock (gate) { captured = Engine; ++activePreparedOperations; }
        try
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                string? path = method is "keepOffline" or "resplit" ? RequiredString(args, "path") : null;
                string[] ids = [];
                if (method == "restoreDeleted")
                {
                    if (!args.TryGetProperty("ids", out var selected) || selected.ValueKind != JsonValueKind.Array || selected.GetArrayLength() is < 1 or > 1000) throw new ArgumentException("Select between one and 1000 deleted entries.");
                    ids = selected.EnumerateArray().Select(value => value.GetString() ?? throw new ArgumentException("Invalid deleted entry.")).ToArray();
                }
                // All external retrieval occurs without the callback lock. Core
                // preparation authenticates immutable refs and revalidates state.
                switch (method)
                {
                    case "previewVersion": captured.PrepareVersionsAsync([RequiredString(args, "versionId")]).GetAwaiter().GetResult(); break;
                    case "restoreVersion": captured.PrepareVersionsAsync([RequiredString(args, "versionId")]).GetAwaiter().GetResult(); break;
                    case "restoreDeleted": captured.PrepareVersionsAsync(ids, deleted: true).GetAwaiter().GetResult(); break;
                    case "keepOffline": captured.PreparePinnedAsync(path!).GetAwaiter().GetResult(); break;
                    case "resplit": VaultEngine.ValidatePartSize(RequiredLong(args, "partSizeBytes")); captured.PrepareEntryAsync(captured.GetInfo(path!)?.EntryId ?? throw new FileNotFoundException()).GetAwaiter().GetResult(); break;
                    case "copyUpgrade": captured.PrepareUpgradeAsync().GetAwaiter().GetResult(); break;
                }
                lock (gate)
                {
                    if (!ReferenceEquals(vault, captured)) throw new InvalidOperationException("The vault changed during retrieval.");
                    try
                    {
                        switch (method)
                        {
                            case "previewVersion": return PreviewInfo(captured.PreviewVersion(RequiredString(args, "versionId")));
                            case "restoreVersion": captured.RestoreVersionAsync(RequiredString(args, "versionId")).GetAwaiter().GetResult(); break;
                            case "restoreDeleted": captured.RestoreDeletedAsync(ids).GetAwaiter().GetResult(); break;
                            case "keepOffline": captured.SetPinnedAsync(path!, true).GetAwaiter().GetResult(); break;
                            case "resplit": captured.ResplitAsync(path!, RequiredLong(args, "partSizeBytes")).GetAwaiter().GetResult(); break;
                            case "copyUpgrade": Upgrade(args); break;
                        }
                        return Status();
                    }
                    catch (VaultHydrationRequiredException) when (attempt < 2) { }
                }
            }
            throw new IOException("Vault content changed repeatedly during retrieval. Retry the operation.");
        }
        catch (Exception error) when ((error is IOException or VaultHydrationRequiredException) && transportMode == "privateGit" && !transportAvailable)
        { throw new InvalidOperationException("Connect to private storage to retrieve unavailable historical content."); }
        finally { lock (gate) --activePreparedOperations; }
    }
    private void Open(JsonElement args, bool create, bool automatic)
    {
        if (vault is not null) throw new InvalidOperationException("Lock the current vault before opening another.");
        if (Volatile.Read(ref syncFlight) != 0) throw new InvalidOperationException("Previous synchronization is stopping. Wait before opening another vault.");
        string selectedTransport = OptionalString(args, "transport") ?? "folder";
        if (selectedTransport is not ("folder" or "privateGit")) throw new ArgumentException("Choose a supported transfer method.");
        var options = new VaultOptions { StorageRoot = System.IO.Path.GetFullPath(RequiredString(args, "storageDir")), CacheRoot = System.IO.Path.GetFullPath(RequiredString(args, "cacheDir")), PartSizeBytes = OptionalLong(args, "partSizeBytes") ?? 10L * 1024 * 1024 };
        string chosenDrive = ValidateDrive(OptionalString(args, "driveLetter") ?? driveLetter);
        string? selectedRepository = OptionalString(args, "remoteRepository");
        string historyIdentity = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(options.StorageRoot.ToUpperInvariant() + "|" + selectedTransport + "|" + selectedRepository))).ToLowerInvariant();
        string historyRoot = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MaterialFileEncryptor-Data", "History", historyIdentity);
        IVaultTransport selectedBackend;
        GitVaultHistory selectedHistory;
        if (selectedTransport == "privateGit")
        {
            string repository = selectedRepository ?? throw new ArgumentException("Choose a private repository.");
            if (privateTransportFactory is not null) (selectedBackend, selectedHistory) = privateTransportFactory(options, historyRoot, repository);
            else
            {
                var remote = new PrivateGitHubVaultTransport(options.StorageRoot, historyRoot, repository);
                selectedBackend = remote; selectedHistory = remote.History;
            }
        }
        else
        {
            selectedBackend = new FolderVaultTransport(options.StorageRoot);
            selectedHistory = new GitVaultHistory(options.CacheRoot, historyRoot);
        }
        bool establishedLocalVault = File.Exists(System.IO.Path.Combine(options.StorageRoot, "vault.json")) || File.Exists(System.IO.Path.Combine(options.CacheRoot, "vault.json"));
        bool connected = true;
        try { selectedBackend.InitializeAsync().GetAwaiter().GetResult(); }
        catch (IOException) when (selectedTransport == "privateGit" && !establishedLocalVault)
        { throw new InvalidOperationException("Connect to private storage before opening a vault that has not been cached locally."); }
        if (selectedTransport == "privateGit")
        {
            try { selectedBackend.SyncAsync().GetAwaiter().GetResult(); }
            catch (Exception error) when (error is IOException or OperationCanceledException or TimeoutException)
            {
                if (create || !establishedLocalVault) throw new InvalidOperationException("Connect to private storage before creating or opening a vault that has not been cached locally.");
                // This is local authentication only. A folder's existence does not
                // establish current remote reachability or permission to publish.
                connected = false;
            }
        }
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
        engineGeneration++;
        cachedFileRevision = -2; cachedHistoryRevision = -2;
        vault = opened; storageDir = options.StorageRoot; cacheDir = options.CacheRoot; identity = opened.VaultId; driveLetter = chosenDrive;
        transportMode = selectedTransport; remoteRepository = OptionalString(args, "remoteRepository");
        transportAvailable = connected; pendingPrivatePublication = selectedTransport == "privateGit";
        transport = selectedBackend; historyStore = selectedHistory; historyPending = true;
        historySourceRoot = selectedTransport == "folder" ? options.CacheRoot : options.StorageRoot;
        nextSyncAttempt = DateTimeOffset.UtcNow;
        opened.HydrateEncryptedFileAsync = (relative, cancellation) => selectedTransport == "privateGit" && !transportAvailable
            ? Task.FromException(new IOException("Connect to private storage to retrieve uncached encrypted content."))
            : selectedBackend.EnsureFileAsync(relative, cancellation);
        if (selectedBackend is PrivateGitHubVaultTransport privateBackend) opened.IsEncryptedFileAvailable = relative => transportAvailable && privateBackend.ContainsFile(relative);
        opened.HistoryChanged += () => { Interlocked.Increment(ref historyRevision); historyPending = true; };
        opened.SyncAsync().GetAwaiter().GetResult();
        syncError = connected ? null : "Private storage is offline. Cached encrypted content remains available; synchronization will retry."; unmountBusy = false; lastOfflineRelease = null;
        if (OptionalBool(args, "autoUnlock")) SaveCredential();
        // Unlock and mount are separate operations; a missing driver never prevents
        // inspection/import/sync of an authenticated vault.
    }
    private void Upgrade(JsonElement args)
    {
        var original = Engine;
        var destination = new VaultOptions
        {
            StorageRoot = System.IO.Path.GetFullPath(RequiredString(args, "storageDir")),
            CacheRoot = System.IO.Path.GetFullPath(RequiredString(args, "cacheDir")),
            PartSizeBytes = OptionalLong(args, "partSizeBytes") ?? 10L * 1024 * 1024
        };
        foreach (string target in new[] { destination.StorageRoot, destination.CacheRoot })
            foreach (string existing in new[] { storageDir!, cacheDir! })
                if (IsWithin(target, existing) || IsWithin(existing, target)) throw new ArgumentException("Upgrade folders must be separate from both original folders.");
        _ = ValidateDrive(OptionalString(args, "driveLetter") ?? driveLetter);
        string selectedTransport = OptionalString(args, "transport") ?? "folder";
        if (selectedTransport is not ("folder" or "privateGit")) throw new ArgumentException("Choose a supported transfer method.");
        string? password = OptionalString(args, "password"), keyPath = OptionalString(args, "keyFilePath");
        if ((password is null) == (keyPath is null)) throw new ArgumentException("Choose either a password or a key file.");
        VaultCredentials credential;
        if (keyPath is not null)
        {
            string resolved = System.IO.Path.GetFullPath(keyPath);
            if (new[] { destination.StorageRoot, destination.CacheRoot, storageDir!, cacheDir! }.Any(root => IsWithin(resolved, root))) throw new ArgumentException("The key file must be outside all vault folders.");
            using var input = File.OpenRead(resolved);
            if (input.Length is < 32 or > 1048576) throw new ArgumentException("A key file must contain 32 bytes to 1 MiB.");
            var key = new byte[(int)input.Length]; input.ReadExactly(key);
            try { credential = VaultCredentials.KeyFile(key); }
            finally { CryptographicOperations.ZeroMemory(key); }
        }
        else credential = VaultCredentials.Password(password!);
        original.SaveDueVersionsAsync(DateTimeOffset.MaxValue).GetAwaiter().GetResult();
        original.FlushAsync().GetAwaiter().GetResult();
        using (credential)
        using (var upgraded = original.CopyUpgradeAsync(destination, credential).GetAwaiter().GetResult()) { }
        // The verified copy exists before the original is closed. A later transport
        // or mount failure leaves both vaults intact and independently unlockable.
        LockEngine(completingPreparedOperation: true);
        Open(args, false, false);
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
            string actualMountPoint = mountedHost.MountPoint();
            registeredDriveLetter = actualMountPoint is { Length: 2 } && actualMountPoint[0] is >= 'A' and <= 'Z' && actualMountPoint[1] == ':' ? actualMountPoint : null;
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
        lock (gate) { host = null; fileSystem = null; registeredDriveLetter = null; unmountBusy = false; }
    }
    private void LockEngine(bool completingPreparedOperation = false)
    {
        lock (gate)
        {
            if (host is not null) throw new InvalidOperationException("Unmount the drive before locking.");
            if (operations.Outstanding != 0) throw new InvalidOperationException("A transfer is active. Cancel it or wait before locking.");
            if (activePreparedOperations > (completingPreparedOperation ? 1 : 0)) throw new InvalidOperationException("A vault operation is retrieving content. Wait before locking.");
            if (vault is null) return;
            vault.SaveDueVersionsAsync(DateTimeOffset.MaxValue).GetAwaiter().GetResult();
            vault.FlushAsync().GetAwaiter().GetResult();
            // Network work never owns the engine. Invalidate its captured identity
            // before disposal and retain durable local changes for the next sync.
            engineGeneration++; syncCancellation?.Cancel();
            // The durable journal is sufficient for reopen/retry. Never start a
            // subprocess from the callback gate, including during lock/disposal.
            vault.Dispose(); vault = null; cachedHistoryRevision = -2; syncError = null; historyStore = null; transport = null;
        }
    }
    private void SaveCredential()
    {
        refreshEnvironment=true;
        byte[] key = Engine.ExportMasterKey();
        try { SavedCredentialStore.Save(Engine.VaultId, key); }
        finally { CryptographicOperations.ZeroMemory(key); }
    }
    private void Forget(JsonElement args)
    {
        refreshEnvironment=true;
        string id = identity ?? SavedCredentialStore.ReadVaultIdentity(RequiredString(args, "storageDir"), RequiredString(args, "cacheDir"));
        SavedCredentialStore.Forget(id);
    }
    private void Import(JsonElement args)
    {
        string[] paths;
        lock (gate)
        {
            _ = Engine;
            if (!args.TryGetProperty("paths", out var selected) || selected.ValueKind != JsonValueKind.Array || selected.GetArrayLength() is < 1 or > 1000)
                throw new ArgumentException("Select between one and 1000 files to import.");
            paths = selected.EnumerateArray().Select(value => System.IO.Path.GetFullPath(value.GetString() ?? throw new ArgumentException("Invalid import path."))).ToArray();
            foreach (string path in paths)
                if (IsWithin(path, storageDir!) || IsWithin(path, cacheDir!)) throw new ArgumentException("Choose files outside the vault folders.");
            ++activePreparedOperations;
        }
        try { ImportManagedAsync(paths, CancellationToken.None, (_, _, _, _) => { }).GetAwaiter().GetResult(); }
        finally { lock (gate) --activePreparedOperations; }
    }
    public void SyncIfUnlocked()
    {
        if (!TryBeginBackgroundWork()) return;
        VaultEngine? capturedEngine = null;
        IVaultTransport? capturedTransport = null;
        long generation = 0;
        bool hadSyncWork = false;
        using var cancellation = new CancellationTokenSource();
        try
        {
            lock (gate)
            {
                if (vault is null || activePreparedOperations != 0) return;
                capturedEngine = vault; capturedTransport = transport; generation = engineGeneration;
                hadSyncWork = capturedEngine.Status.PendingCommits > 0 || capturedEngine.JournalStatistics.PendingFrames > 0 || pendingPrivatePublication;
                syncing = true; syncCancellation = cancellation;
                nextSyncAttempt = DateTimeOffset.UtcNow.AddSeconds(15);
                fileSystem?.RecoverPending();
                // Local journal/object publication and history remain serialized.
                capturedEngine.FlushLocalOnly();
            }
            capturedEngine.FlushAsync(cancellation.Token).GetAwaiter().GetResult();
            if (hadSyncWork) capturedEngine.RecordActivity(capturedEngine.VaultId, "sync", detail: "Encrypted synchronization started");
            RecordHistory(cancellation.Token);
            // Only the captured transport is used during network waits. No WinFsp
            // callback gate or engine lifetime is held across either network pass.
            SynchronizeTransport(capturedTransport, cancellation.Token);
            bool publishAgain;
            lock (gate)
            {
                if (generation != engineGeneration || !ReferenceEquals(vault, capturedEngine)) return;
                publishAgain = transportMode == "privateGit";
            }
            capturedEngine.SyncAsync(cancellation.Token).GetAwaiter().GetResult();
            capturedEngine.SynchronizeActivity();
            RecordHistory(cancellation.Token);
            if (publishAgain) SynchronizeTransport(capturedTransport, cancellation.Token);
            lock (gate)
            {
                if (generation != engineGeneration || !ReferenceEquals(vault, capturedEngine)) return;
                lastSync = DateTimeOffset.UtcNow; transportAvailable = true;
                if (publishAgain) pendingPrivatePublication = false;
                syncError = capturedEngine.Status.LastError is null ? null : "Encrypted storage synchronization needs attention.";
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch
        {
            lock (gate)
                if (generation == engineGeneration && ReferenceEquals(vault, capturedEngine))
                {
                    transportAvailable = false;
                    syncError = "Encrypted storage could not synchronize. Changes remain in the encrypted local cache.";
                }
            throw;
        }
        finally
        {
            lock (gate) { if (ReferenceEquals(syncCancellation, cancellation)) { syncCancellation = null; syncing = false; } }
            EndBackgroundWork();
        }
    }
    public void TickIfUnlocked()
    {
        if(!TryBeginBackgroundWork())return;
        bool synchronize=false;
        try
        {
            lock (gate)
            {
                if (vault is null || activePreparedOperations != 0) return;
                Engine.SaveDueVersionsAsync(DateTimeOffset.UtcNow).GetAwaiter().GetResult();
                synchronize=DateTimeOffset.UtcNow>=nextSyncAttempt;
            }
        }
        finally{EndBackgroundWork();}
        // The queued worker must acquire admission again. Force lock may win
        // after the timer releases its reservation and before the task starts.
        if(synchronize)_ = Task.Run(() => { try { SyncIfUnlocked(); } catch { /* Status retains the safe synchronization error. */ } });
    }
    private static object VersionInfo(VaultVersionInfo version) => new
    {
        id = version.Id, entryId = version.EntryId, path = version.Path, timestampUtc = version.TimestampUtc,
        length = version.Length, isDirectory = version.IsDirectory, deleted = version.Deleted, isAvailable = version.IsAvailable,
        descendantIds = version.DescendantIds ?? Array.Empty<string>()
    };
    private void SynchronizeTransport(IVaultTransport? capturedTransport, CancellationToken cancellation)
    {
        historyOperations.Wait(cancellation);
        try { capturedTransport?.SyncAsync(cancellation).GetAwaiter().GetResult(); }
        finally { historyOperations.Release(); }
    }
    private void RecordHistory(CancellationToken cancellation = default)
    {
        if (Monitor.IsEntered(gate)) throw new InvalidOperationException("History subprocesses cannot run inside the filesystem callback lock.");
        historyOperations.Wait(cancellation);
        try
        {
            GitVaultHistory capturedHistory;
            VaultEngine capturedEngine;
            string[] paths;
            long generation, revision;
            lock (gate)
            {
                if (!historyPending || historyStore is null || vault is null || !Directory.Exists(historySourceRoot)) return;
                // Partial publication retains the retry flag even if no later
                // engine event fires. Object paths are immutable once published.
                if (Engine.Status.PendingCommits > 0) return;
                capturedHistory = historyStore; capturedEngine = vault;
                generation = engineGeneration; revision = Volatile.Read(ref historyRevision);
                paths = Engine.GetEncryptedSnapshotPaths().Where(relative => File.Exists(System.IO.Path.Combine(historySourceRoot!, relative))).ToArray();
            }
            var recorded = capturedHistory.RecordSnapshotAsync(paths, cancellation).GetAwaiter().GetResult();
            lock (gate)
            {
                if (generation != engineGeneration || !ReferenceEquals(vault, capturedEngine) || !ReferenceEquals(historyStore, capturedHistory)) return;
                if (transportMode == "privateGit" && recorded is not null) pendingPrivatePublication = true;
                if (revision == Volatile.Read(ref historyRevision)) historyPending = false;
            }
        }
        finally { historyOperations.Release(); }
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
    internal static long? OptionalLong(JsonElement args, string name) => args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var value) && value.ValueKind != JsonValueKind.Null ? value.GetInt64() : null;
    public void Dispose() { Unmount(); LockEngine(); }
}
