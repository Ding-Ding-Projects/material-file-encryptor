using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using MaterialFileEncryptor.Core;

namespace MaterialFileEncryptor.Host;

/// <summary>
/// Asks the desktop process to fetch an encrypted part held by a registry split storage location.
/// The request leaves as a <c>hydratePart</c> event on the private pipe; the desktop process writes
/// the ciphertext to the named temporary path and answers with the <c>hydratePartResult</c> command.
/// The engine authenticates the bytes before using them, so the desktop process is never trusted with
/// anything but delivery.
/// </summary>
internal static partial class PartHydrationBridge
{
    private static readonly ConcurrentDictionary<string, TaskCompletionSource<string?>> pending = new(StringComparer.Ordinal);
    /// <summary>Writes one event line to the desktop process. Null outside the desktop pipe (tests, self-test).</summary>
    public static Action<object>? Send { get; set; }
    public static int PendingCount => pending.Count;

    [GeneratedRegex(@"\A[0-9a-f]{32}\z")] private static partial Regex RequestId();

    public static async Task FetchAsync(PlacedPartFetch request, CancellationToken cancellationToken)
    {
        var send = Send ?? throw new IOException($"This file is stored on {request.Label}, which is not connected.");
        string requestId = Guid.NewGuid().ToString("N");
        var completion = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[requestId] = completion;
        try
        {
            using (cancellationToken.Register(() =>
            {
                if (completion.TrySetCanceled(cancellationToken))
                    try { send(new { @event = "hydratePartCancel", requestId }); } catch (IOException) { }
            }))
            {
                send(new { @event = "hydratePart", requestId, part = request.PartId, location = request.LocationId, storageDir = request.StorageRoot, destination = request.DestinationPath });
                string? error = await completion.Task.ConfigureAwait(false);
                if (error is not null) throw new IOException(error);
            }
        }
        finally { pending.TryRemove(requestId, out _); }
    }

    /// <summary>Handles the desktop process answer. Unknown or late answers are ignored.</summary>
    public static object Complete(JsonElement args)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("requestId", out var id) || id.ValueKind != JsonValueKind.String || !RequestId().IsMatch(id.GetString()!))
            throw new ArgumentException("Invalid hydration result.");
        if (!args.TryGetProperty("ok", out var ok) || ok.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) throw new ArgumentException("Invalid hydration result.");
        string? error = null;
        if (!ok.GetBoolean())
        {
            error = args.TryGetProperty("error", out var supplied) && supplied.ValueKind == JsonValueKind.String ? supplied.GetString() : null;
            if (string.IsNullOrWhiteSpace(error) || error.Length > 500 || error.Any(char.IsControl)) error = "The encrypted part could not be fetched from registry storage.";
        }
        bool accepted = pending.TryRemove(id.GetString()!, out var completion) && completion.TrySetResult(error);
        return new { accepted };
    }
}
