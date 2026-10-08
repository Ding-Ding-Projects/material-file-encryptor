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
}
internal sealed record RecordRef(string Part, long Offset, int PlainLength, int RecordLength);
internal sealed class Config
{
    public int Format { get; set; } = 1;
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
internal sealed class Commit
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Device { get; set; } = "";
    public List<string> Parents { get; set; } = [];
    public List<Change> Changes { get; set; } = [];
    public Dictionary<string,Entry> Directories { get; set; } = [];
}
internal sealed class Journal
{
    public long PartSize { get; set; }
    public Dictionary<string, Entry> Entries { get; set; } = [];
    public Dictionary<string, Entry> Baseline { get; set; } = [];
    public HashSet<string> Pending { get; set; } = [];
    public HashSet<string> Known { get; set; } = [];
    public HashSet<string> Heads { get; set; } = [];
    public HashSet<string> Pinned { get; set; } = [];
}
