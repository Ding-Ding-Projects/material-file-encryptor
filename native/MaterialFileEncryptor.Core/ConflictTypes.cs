using System.Text.Json.Serialization;

namespace MaterialFileEncryptor.Core;

public sealed record VaultConflictEntry([property: JsonPropertyName("entryId")] string EntryId,
    [property: JsonPropertyName("path")] string Path, [property: JsonPropertyName("versionId")] string VersionId,
    [property: JsonPropertyName("isDirectory")] bool IsDirectory,
    [property: JsonPropertyName("historyVersionId")] string? HistoryVersionId = null,
    [property: JsonPropertyName("isLive")] bool IsLive = true);
public sealed record VaultConflictInfo([property: JsonPropertyName("conflictId")] string ConflictId,
    [property: JsonPropertyName("kind")] string Kind, [property: JsonPropertyName("current")] VaultConflictEntry? Current,
    [property: JsonPropertyName("preserved")] VaultConflictEntry? Preserved,
    [property: JsonPropertyName("supportedChoices")] IReadOnlyList<string> SupportedChoices,
    [property: JsonPropertyName("unsupportedReason")] string? UnsupportedReason,
    [property: JsonPropertyName("deletion")] VaultDeletionIntent? Deletion = null,
    [property: JsonPropertyName("recoveryDirectory")] string? RecoveryDirectory = null);
public sealed record VaultDeletionIntent([property: JsonPropertyName("deletionCommitId")] string DeletionCommitId,
    [property: JsonPropertyName("path")] string Path, [property: JsonPropertyName("entryId")] string EntryId,
    [property: JsonPropertyName("expectedVersion")] string ExpectedVersion);
public sealed record VaultConflictPage([property: JsonPropertyName("items")] IReadOnlyList<VaultConflictInfo> Items,
    [property: JsonPropertyName("nextCursor")] string? NextCursor);
public sealed record VaultConflictResult([property: JsonPropertyName("conflictId")] string ConflictId,
    [property: JsonPropertyName("choice")] string Choice, [property: JsonPropertyName("resolved")] bool Resolved,
    [property: JsonPropertyName("restoredPaths")] IReadOnlyList<string>? RestoredPaths = null);

internal sealed record ConflictResolution(string ConflictId, string CurrentVersion, string PreservedVersion, string Choice,
    string? CurrentEntryId = null, string? PreservedEntryId = null,
    string? CurrentPath = null, string? PreservedPath = null,
    string? CurrentHistoryVersionId = null, string? PreservedHistoryVersionId = null);
internal sealed record DeletionResolution(string ConflictId, string Choice, VaultDeletionIntent Deletion,
    string CurrentEntryId, string CurrentPath, string CurrentVersion, string CurrentHistoryVersionId);
internal sealed record ConflictRecovery(string ConflictId, string FirstResolutionCommitId, string SecondResolutionCommitId,
    string CurrentHistoryVersionId, string PreservedHistoryVersionId, string CurrentVersion, string PreservedVersion,
    List<string> RestoredPaths, List<string> RestoredEntryIds);
