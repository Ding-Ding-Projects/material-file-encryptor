using Fsp;
using Fsp.Interop;
using MaterialFileEncryptor.Core;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using FsInfo = Fsp.Interop.FileInfo;

namespace MaterialFileEncryptor.Host;

// WinFsp's kernel driver enforces share modes and byte-range locks. File nodes use
// stable encrypted-entry identities so replacement and deletion retain open data.
internal sealed class VaultFileSystem : FileSystemBase
{
    private sealed record Node(string Id);
    private sealed class Handle(IDisposable lease)
    {
        public IDisposable Lease { get; } = lease;
        public bool Closed { get; set; }
    }
    private readonly VaultEngine vault;
    private readonly object gate;
    private readonly byte[] security;
    private readonly Dictionary<string, Node> nodes = new(StringComparer.Ordinal);
    private readonly HashSet<string> pendingDeletes = new(StringComparer.Ordinal);
    private int activeHandles, activeIo;
    private readonly string cacheVolumeRoot;
    private bool stopping;
    public string? LastError { get; private set; }
    public int ActiveHandles { get { lock (gate) return activeHandles; } }

    public VaultFileSystem(VaultEngine vault, object gate)
    {
        this.vault = vault;
        this.gate = gate;
        cacheVolumeRoot = System.IO.Path.GetPathRoot(vault.CacheRoot) ?? throw new InvalidOperationException("Cache volume root is unavailable.");
        string sid = WindowsIdentity.GetCurrent().User?.Value ?? throw new InvalidOperationException("Windows user identity is unavailable.");
        var descriptor = new RawSecurityDescriptor($"O:{sid}G:{sid}D:P(A;;FA;;;SY)(A;;FA;;;{sid})");
        security = new byte[descriptor.BinaryLength];
        descriptor.GetBinaryForm(security, 0);
    }

    public override int Init(object hostObject)
    {
        var host = (FileSystemHost)hostObject;
        host.SectorSize = 512;
        host.SectorsPerAllocationUnit = 8;
        host.VolumeCreationTime = (ulong)DateTime.UtcNow.ToFileTimeUtc();
        host.VolumeSerialNumber = 0x4D464531;
        host.CaseSensitiveSearch = false;
        host.CasePreservedNames = true;
        host.UnicodeOnDisk = true;
        host.PersistentAcls = false;
        host.NamedStreams = false;
        host.ReparsePoints = false;
        // Stable entry leases support Windows' extended rename/delete requests.
        // Legacy MoveFileEx still obeys the kernel's open-handle restrictions.
        host.SupportsPosixUnlinkRename = true;
        host.FileInfoTimeout = 0;
        host.FlushAndPurgeOnCleanup = true;
        host.PostCleanupWhenModifiedOnly = false;
        host.PostDispositionWhenNecessaryOnly = true;
        host.PassQueryDirectoryFileName = true;
        host.FileSystemName = "MaterialVault";
        return STATUS_SUCCESS;
    }

    // Called while the controller owns gate. Reject further opens before stopping
    // the dispatcher, but never wait for dispatcher threads while gate is held.
    public bool BeginUnmount()
    {
        lock (gate)
        {
            if (activeHandles != 0 || activeIo != 0) return false;
            RecoverPending();
            stopping = true;
            LastError = null;
            return true;
        }
    }
    public void CancelUnmount() { lock (gate) stopping = false; }
    public void RecoverPending()
    {
        lock (gate)
        {
            foreach (string id in pendingDeletes)
            {
                try { vault.DeleteById(id); }
                catch (FileNotFoundException) { /* Deletion already reached the namespace. */ }
            }
            Durable();
            pendingDeletes.Clear();
        }
    }
    private void Durable() { vault.FlushAsync().GetAwaiter().GetResult(); LastError = null; }
    private static string PathOf(string name) => VaultPath.Normalize(name);
    private VaultEntryInfo Info(object node) => vault.GetInfoById(((Node)node).Id) ?? throw new FileNotFoundException();
    private Node NodeFor(VaultEntryInfo info)
    {
        if (!nodes.TryGetValue(info.EntryId, out var node)) nodes[info.EntryId] = node = new Node(info.EntryId);
        return node;
    }
    private static FsInfo ToInfo(VaultEntryInfo info)
    {
        byte[] hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(info.EntryId));
        return new FsInfo
        {
            FileAttributes = (info.Attributes & ~(uint)FileAttributes.Directory) | (uint)(info.IsDirectory ? FileAttributes.Directory : FileAttributes.Archive),
            FileSize = (ulong)info.Length,
            AllocationSize = ((ulong)info.Length + 4095) / 4096 * 4096,
            CreationTime = (ulong)info.CreatedUtc.UtcDateTime.ToFileTimeUtc(),
            LastAccessTime = (ulong)info.ModifiedUtc.UtcDateTime.ToFileTimeUtc(),
            LastWriteTime = (ulong)info.ModifiedUtc.UtcDateTime.ToFileTimeUtc(),
            ChangeTime = (ulong)info.ModifiedUtc.UtcDateTime.ToFileTimeUtc(),
            IndexNumber = BitConverter.ToUInt64(hash)
        };
    }
    public override int ExceptionHandler(Exception ex)
    {
        LastError = "The encrypted filesystem operation failed. Retry after checking storage availability.";
        return ex switch
        {
            FileNotFoundException => STATUS_OBJECT_NAME_NOT_FOUND,
            DirectoryNotFoundException => STATUS_OBJECT_PATH_NOT_FOUND,
            UnauthorizedAccessException => STATUS_ACCESS_DENIED,
            ArgumentException or OverflowException => STATUS_INVALID_PARAMETER,
            OutOfMemoryException => STATUS_INSUFFICIENT_RESOURCES,
            _ => STATUS_UNEXPECTED_IO_ERROR
        };
    }
    public override int GetVolumeInfo(out VolumeInfo info)
    {
        info = default;
        // Capacity is bounded by backing storage; Windows gets the local cache's
        // free capacity since dirty writes must first be durable there.
        try
        {
            var drive = new DriveInfo(cacheVolumeRoot);
            info.TotalSize = (ulong)drive.TotalSize;
            info.FreeSize = (ulong)drive.AvailableFreeSpace;
        }
        catch { return STATUS_DEVICE_NOT_READY; }
        info.SetVolumeLabel("Material Files");
        return STATUS_SUCCESS;
    }
    public override int GetSecurityByName(string name, out uint attributes, ref byte[] descriptor)
    {
        lock (gate)
        {
            var info = vault.GetInfo(PathOf(name));
            attributes = info is null ? 0 : ToInfo(info).FileAttributes;
            if (info is null) return STATUS_OBJECT_NAME_NOT_FOUND;
            if (descriptor is not null) descriptor = security;
            return STATUS_SUCCESS;
        }
    }
    public override int Create(string name, uint options, uint access, uint attributes, byte[] descriptor, ulong allocationSize,
        out object node, out object fileDesc, out FsInfo info, out string normalizedName)
    {
        lock (gate)
        {
            node = fileDesc = null!; info = default; normalizedName = null!;
            if (stopping) return STATUS_DEVICE_NOT_READY;
            string path = PathOf(name);
            if (vault.GetInfo(path) is not null) return STATUS_OBJECT_NAME_COLLISION;
            if ((options & FILE_DIRECTORY_FILE) != 0) vault.CreateDirectory(path); else vault.CreateFile(path);
            vault.SetBasicInfo(path, attributes, null, null);
            Durable();
            return Open(name, options, access, out node, out fileDesc, out info, out normalizedName);
        }
    }
    public override int Open(string name, uint options, uint access, out object node, out object fileDesc, out FsInfo info, out string normalizedName)
    {
        lock (gate)
        {
            node = fileDesc = null!; info = default; normalizedName = null!;
            if (stopping) return STATUS_DEVICE_NOT_READY;
            var entry = vault.GetInfo(PathOf(name));
            if (entry is null) return STATUS_OBJECT_NAME_NOT_FOUND;
            if (entry.IsDirectory && (options & FILE_NON_DIRECTORY_FILE) != 0) return STATUS_FILE_IS_A_DIRECTORY;
            if (!entry.IsDirectory && (options & FILE_DIRECTORY_FILE) != 0) return STATUS_NOT_A_DIRECTORY;
            node = NodeFor(entry);
            fileDesc = new Handle(vault.AcquireOpenById(entry.EntryId));
            ++activeHandles;
            info = ToInfo(entry);
            normalizedName = "\\" + entry.Path.Replace('/', '\\');
            return STATUS_SUCCESS;
        }
    }
    public override int Overwrite(object node, object desc, uint attributes, bool replaceAttributes, ulong allocationSize, out FsInfo info)
    {
        FsInfo completedInfo = default;
        int result = WithHydration(node, desc,
            id => vault.PrepareSetLengthAsync(id, 0).GetAwaiter().GetResult(),
            id =>
            {
                var entry = vault.GetInfoById(id);
                vault.SetLengthById(id, 0);
                vault.SetBasicInfoById(id, replaceAttributes ? attributes : entry.Attributes | attributes, null, null);
                Durable(); completedInfo = ToInfo(vault.GetInfoById(id)); return STATUS_SUCCESS;
            });
        info = completedInfo; return result;
    }
    private int WithHydration(object node, object desc, Action<string> prepare, Func<string, int> operation)
    {
        string id;
        IDisposable lease;
        lock (gate)
        {
            if (stopping || ((Handle)desc).Closed) return STATUS_DEVICE_NOT_READY;
            id = ((Node)node).Id;
            lease = vault.AcquireOpenById(id);
            ++activeIo;
        }
        try
        {
            for (int attempt = 0; attempt < 3; attempt++)
            {
                // Process startup can query this mounted volume. Neither the
                // callback lock nor the core lock is held during preparation.
                prepare(id);
                lock (gate)
                {
                    if (stopping || ((Handle)desc).Closed) return STATUS_DEVICE_NOT_READY;
                    try { return operation(id); }
                    catch (VaultHydrationRequiredException) when (attempt < 2) { }
                }
            }
            throw new IOException("Encrypted entry changed repeatedly during retrieval. Retry the operation.");
        }
        finally { lock (gate) { try { lease.Dispose(); } finally { --activeIo; } } }
    }
    public override unsafe int Read(object node, object desc, IntPtr buffer, ulong offset, uint length, out uint transferred)
    {
        uint completed = 0;
        int result = WithHydration(node, desc,
            id => vault.PrepareReadRangeAsync(id, checked((long)offset), checked((int)length)).GetAwaiter().GetResult(),
            id =>
            {
                var entry = vault.GetInfoById(id);
                if (entry.IsDirectory) return STATUS_FILE_IS_A_DIRECTORY;
                if (offset >= (ulong)entry.Length) return STATUS_END_OF_FILE;
                int count = checked((int)Math.Min((ulong)length, (ulong)entry.Length - offset));
                completed = checked((uint)vault.ReadRangeById(id, checked((long)offset), new Span<byte>((void*)buffer, count)));
                return STATUS_SUCCESS;
            });
        transferred = completed; return result;
    }
    public override unsafe int Write(object node, object desc, IntPtr buffer, ulong offset, uint length, bool append, bool constrained, out uint transferred, out FsInfo info)
    {
        uint completed = 0; FsInfo completedInfo = default;
        int result = WithHydration(node, desc,
            id =>
            {
                var entry = vault.GetInfoById(id);
                long start = append ? entry.Length : checked((long)offset);
                int count = checked((int)(constrained ? Math.Max(0, Math.Min((long)length, entry.Length - start)) : length));
                vault.PrepareWriteRangeAsync(id, start, count).GetAwaiter().GetResult();
            },
            id =>
            {
                var entry = vault.GetInfoById(id);
                if (entry.IsDirectory) return STATUS_FILE_IS_A_DIRECTORY;
                ulong start = append ? (ulong)entry.Length : offset;
                if (constrained && start >= (ulong)entry.Length) { completedInfo = ToInfo(entry); return STATUS_SUCCESS; }
                int count = checked((int)(constrained ? Math.Min((ulong)length, (ulong)entry.Length - start) : length));
                vault.WriteRangeById(id, checked((long)start), new ReadOnlySpan<byte>((void*)buffer, count));
                Durable(); completed = (uint)count; completedInfo = ToInfo(vault.GetInfoById(id)); return STATUS_SUCCESS;
            });
        transferred = completed; info = completedInfo; return result;
    }
    public override int Flush(object node, object desc, out FsInfo info)
    {
        lock (gate) { Durable(); info = node is null ? default : ToInfo(Info(node)); return STATUS_SUCCESS; }
    }
    public override int GetFileInfo(object node, object desc, out FsInfo info)
    {
        lock (gate) { info = ToInfo(Info(node)); return STATUS_SUCCESS; }
    }
    public override int SetFileSize(object node, object desc, ulong size, bool allocation, out FsInfo info)
    {
        FsInfo completedInfo = default;
        int result = WithHydration(node, desc,
            id => { if (!allocation || size < (ulong)vault.GetInfoById(id).Length) vault.PrepareSetLengthAsync(id, checked((long)size)).GetAwaiter().GetResult(); },
            id =>
            {
                var entry = vault.GetInfoById(id);
                if (!allocation || size < (ulong)entry.Length) vault.SetLengthById(id, checked((long)size));
                Durable(); completedInfo = ToInfo(vault.GetInfoById(id)); return STATUS_SUCCESS;
            });
        info = completedInfo; return result;
    }
    public override int SetBasicInfo(object node, object desc, uint attributes, ulong creation, ulong access, ulong modified, ulong change, out FsInfo info)
    {
        lock (gate)
        {
            var entry = Info(node);
            vault.SetBasicInfoById(entry.EntryId, attributes == uint.MaxValue ? null : attributes,
                creation == 0 ? null : new DateTimeOffset(DateTime.FromFileTimeUtc(checked((long)creation))),
                modified == 0 ? null : new DateTimeOffset(DateTime.FromFileTimeUtc(checked((long)modified))));
            Durable(); info = ToInfo(Info(node)); return STATUS_SUCCESS;
        }
    }
    public override int CanDelete(object node, object desc, string name)
    {
        lock (gate)
        {
            var entry = Info(node);
            if (entry.Path.Length == 0) return STATUS_ACCESS_DENIED;
            if (entry.IsDirectory && vault.Enumerate(entry.Path).Count != 0) return STATUS_DIRECTORY_NOT_EMPTY;
            return STATUS_SUCCESS;
        }
    }
    public override int Rename(object node, object desc, string oldName, string newName, bool replace)
    {
        lock (gate)
        {
            string source = Info(node).Path, destination = PathOf(newName);
            if (source.Length == 0) return STATUS_ACCESS_DENIED;
            var target = vault.GetInfo(destination);
            if (target is not null && target.EntryId != ((Node)node).Id)
            {
                if (!replace) return STATUS_OBJECT_NAME_COLLISION;
                if (target.IsDirectory) return STATUS_ACCESS_DENIED;
            }
            vault.Rename(source, destination, replace); Durable(); return STATUS_SUCCESS;
        }
    }
    public override void Cleanup(object node, object desc, string name, uint flags)
    {
        lock (gate)
        {
            try
            {
                if ((flags & CleanupDelete) != 0) { string id = ((Node)node).Id; pendingDeletes.Add(id); vault.DeleteById(id); Durable(); pendingDeletes.Remove(id); }
            }
            catch { LastError = "A file cleanup could not be saved. Keep the drive unlocked and retry sync."; }
            // Close retains the descriptor lease for outstanding mapped views.
        }
    }
    public override void Close(object node, object desc)
    {
        lock (gate)
        {
            var handle = (Handle)desc;
            try { handle.Lease.Dispose(); }
            catch { LastError = "A file close could not complete. Retry sync before locking."; }
            finally { if (!handle.Closed) { handle.Closed = true; --activeHandles; } }
        }
    }
    public override int GetSecurity(object node, object desc, ref byte[] descriptor) { descriptor = security; return STATUS_SUCCESS; }
    public override int SetSecurity(object node, object desc, AccessControlSections sections, byte[] descriptor) => STATUS_ACCESS_DENIED;
    public override bool ReadDirectoryEntry(object node, object desc, string pattern, string marker, ref object context, out string name, out FsInfo info)
    {
        lock (gate)
        {
            if (context is not IEnumerator<VaultEntryInfo> iterator)
            {
                var parent = Info(node);
                if (parent.Path.Length == 0 && parent.EntryId != vault.VaultId) { name = null!; info = default; return false; }
                var entries = vault.Enumerate(parent.Path).OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase);
                iterator = entries.Where(x => marker is null || StringComparer.OrdinalIgnoreCase.Compare(x.Name, marker) > 0).GetEnumerator();
                context = iterator;
            }
            if (iterator.MoveNext()) { name = iterator.Current.Name; info = ToInfo(iterator.Current); return true; }
            iterator.Dispose(); name = null!; info = default; return false;
        }
    }
    public override int GetDirInfoByName(object node, object desc, string name, out string normalizedName, out FsInfo info)
    {
        lock (gate)
        {
            var parent = Info(node);
            if (parent.Path.Length == 0 && parent.EntryId != vault.VaultId) { normalizedName = null!; info = default; return STATUS_OBJECT_NAME_NOT_FOUND; }
            var entry = vault.GetInfo(parent.Path.Length == 0 ? PathOf(name) : parent.Path + "/" + PathOf(name));
            normalizedName = entry?.Name!; info = entry is null ? default : ToInfo(entry);
            return entry is null ? STATUS_OBJECT_NAME_NOT_FOUND : STATUS_SUCCESS;
        }
    }
}
