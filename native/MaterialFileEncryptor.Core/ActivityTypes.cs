namespace MaterialFileEncryptor.Core;

public sealed record VaultActivity(string Id, string EntryId, string Action, DateTimeOffset TimestampUtc, string? Path, string? VersionId, string? Detail);
public sealed record VaultActivityQuery(string? EntryId = null, string? Action = null, DateTimeOffset? FromUtc = null, DateTimeOffset? ToUtc = null, string? Pattern = null, string? Cursor = null, int Limit = 100);
public sealed record VaultActivityPage(IReadOnlyList<VaultActivity> Items, string? NextCursor);
public sealed record VaultVersionPreview(string VersionId, string Text, long Length);
