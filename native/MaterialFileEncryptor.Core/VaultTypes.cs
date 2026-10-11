using System.Security.Cryptography;
namespace MaterialFileEncryptor.Core;

public sealed class VaultOptions
{
    public required string StorageRoot { get; init; }
    public required string CacheRoot { get; init; }
    public long PartSizeBytes { get; init; } = 10 * 1024 * 1024;
    public string? DeviceId { get; init; }
}
public sealed class VaultCredentials : IDisposable
{
    internal byte[] Bytes { get; }
    internal string Kind { get; }
    private VaultCredentials(byte[] bytes, string kind) { Bytes = bytes; Kind = kind; }
    public static VaultCredentials Password(string password) => string.IsNullOrEmpty(password) ? throw new ArgumentException("Password is required.") : new(System.Text.Encoding.UTF8.GetBytes(password), "password");
    public static VaultCredentials KeyFile(ReadOnlySpan<byte> bytes) => bytes.Length is < 32 or > 1048576 ? throw new ArgumentException("Key files must contain 32 bytes to 1 MiB.") : new(bytes.ToArray(), "keyfile");
    public static byte[] GenerateKeyFile() => RandomNumberGenerator.GetBytes(32);
    public void Dispose() => CryptographicOperations.ZeroMemory(Bytes);
}
public sealed record VaultEntryInfo(string Path, string Name, bool IsDirectory, long Length, DateTimeOffset CreatedUtc, DateTimeOffset ModifiedUtc, bool IsPinned, string VersionId, string EntryId, uint Attributes, long PartSizeBytes = 0, int PartCount = 0);
public sealed record VaultSyncStatus(int PendingCommits, int PendingIncomingCommits, bool IsSourceAvailable, string? LastError);
internal sealed class Entry
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Version { get; set; } = Guid.NewGuid().ToString("N");
    public bool Directory { get; set; }
    public long Length { get; set; }
    public int ChunkSize { get; set; }
    public long PartSize { get; set; }
    public DateTimeOffset Created { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset Modified { get; set; } = DateTimeOffset.UtcNow;
    public uint Attributes { get; set; }
    public Dictionary<long, RecordRef> Records { get; set; } = [];
    public Dictionary<long, RecordRef> Overlays { get; set; } = [];
    public int OverlaySize { get; set; }
    public long? BaseLength { get; set; }
}
internal sealed record RecordRef(string Part, long Offset, int PlainLength, int RecordLength, int Encoding = 0);
internal sealed class Config
{
    public int Format { get; set; } = 3;
    public string VaultId { get; set; } = Guid.NewGuid().ToString("N");
    public string Kind { get; set; } = "";
    public int Iterations { get; set; } = 600000;
    public byte[] Salt { get; set; } = [];
    public byte[] WrappedKey { get; set; } = [];
    public byte[] KeyCheck { get; set; } = [];
}
internal sealed class Change
{
    public string Path { get; set; } = "";
    public string? ExpectedVersion { get; set; }
    public Entry? Value { get; set; }
}
internal sealed class StoredVersion
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Path { get; set; } = "";
    public Entry Value { get; set; } = new();
    public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    public bool Deleted { get; set; }
    public string DeletionBatch { get; set; } = "";
    public Dictionary<string,string> Ancestors { get; set; } = [];
}
public sealed record VaultVersionInfo(string Id, string EntryId, string Path, DateTimeOffset TimestampUtc, long Length, bool IsDirectory, bool Deleted, bool IsAvailable, IReadOnlyList<string>? DescendantIds = null);
internal sealed class Commit
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public List<StoredVersion> Versions { get; set; } = [];
    public List<string> BinHiddenIds { get; set; } = [];
    public string Device { get; set; } = "";
    public List<string> Parents { get; set; } = [];
    public List<Change> Changes { get; set; } = [];
    public Dictionary<string,Entry> Directories { get; set; } = [];
}
internal sealed class Journal
{
    public long LogSequence { get; set; }
    public string LogDigest { get; set; } = "";
    public long PartSize { get; set; }
    public Dictionary<string, DateTimeOffset> VersionDue { get; set; } = [];
    public List<StoredVersion> PendingVersions { get; set; } = [];
    public HashSet<string> HiddenBin { get; set; } = [];
    public Dictionary<string, Entry> Entries { get; set; } = [];
    public Dictionary<string, Entry> Baseline { get; set; } = [];
    public HashSet<string> Pending { get; set; } = [];
    public HashSet<string> Known { get; set; } = [];
    public HashSet<string> Heads { get; set; } = [];
    public HashSet<string> Pinned { get; set; } = [];
}

public sealed record VaultJournalStatistics(long AppendedBytes, long AppendedFrames, long CheckpointBytes, long Checkpoints);
internal sealed class JournalMutation
{
    public string Kind { get; set; } = "";
    public string Id { get; set; } = "";
    public string Path { get; set; } = "";
    public string Destination { get; set; } = "";
    public Entry? Metadata { get; set; }
    public Dictionary<long,RecordRef> Records { get; set; } = [];
    public bool Overlay { get; set; }
    public long? TruncateOverlayAt { get; set; }
    public StoredVersion? Version { get; set; }
    public DateTimeOffset? Due { get; set; }
}
