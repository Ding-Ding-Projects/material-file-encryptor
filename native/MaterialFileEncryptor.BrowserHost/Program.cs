using System.Buffers.Binary;
using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MaterialFileEncryptor.BrowserHost;

public static class NativeFrames
{
    public const int Maximum = 65536;
    public static async Task<JsonElement?> Read(Stream stream, CancellationToken cancel)
    {
        var prefix = new byte[4];
        var first = await stream.ReadAsync(prefix.AsMemory(0, 1), cancel);
        if (first == 0) return null;
        await stream.ReadExactlyAsync(prefix.AsMemory(1), cancel);
        var length = BinaryPrimitives.ReadUInt32LittleEndian(prefix);
        if (length is 0 or > Maximum) throw new InvalidDataException("Native frame exceeds 64 KiB.");
        var bytes = new byte[(int)length];
        await stream.ReadExactlyAsync(bytes, cancel);
        var text = new UTF8Encoding(false, true).GetString(bytes);
        using var document = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 16 });
        Validate(document.RootElement);
        return document.RootElement.Clone();
    }
    public static void Validate(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Object)
        {
            var seen = new HashSet<string>(StringComparer.Ordinal);
            foreach (var property in value.EnumerateObject())
            {
                if (!seen.Add(property.Name) || property.Name is "__proto__" or "constructor" or "prototype")
                    throw new InvalidDataException("Invalid JSON field.");
                Validate(property.Value);
            }
        }
        else if (value.ValueKind == JsonValueKind.Array)
            foreach (var item in value.EnumerateArray()) Validate(item);
    }
    public static async Task Write(Stream stream, object value, CancellationToken cancel)
    {
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
        if (bytes.Length is 0 or > Maximum) throw new InvalidDataException("Native frame exceeds 64 KiB.");
        var prefix = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(prefix, (uint)bytes.Length);
        await stream.WriteAsync(prefix, cancel); await stream.WriteAsync(bytes, cancel); await stream.FlushAsync(cancel);
    }
    public static bool Exact(JsonElement value, params string[] fields) => value.ValueKind == JsonValueKind.Object
        && value.EnumerateObject().Count() == fields.Length && fields.All(field => value.TryGetProperty(field, out _));
    // The secret-free final notice the desktop sends before it ends a pairing. Exactly this shape and these reasons, nothing else.
    public static readonly string[] RevokeReasons = { "exit", "lock", "update" };
    public static bool IsRevokedNotice(JsonElement value) => Exact(value, "type", "reason")
        && value.GetProperty("type").ValueKind == JsonValueKind.String && value.GetProperty("type").GetString() == "revoked"
        && value.GetProperty("reason").ValueKind == JsonValueKind.String && RevokeReasons.Contains(value.GetProperty("reason").GetString());
}

public static class PipeIdentity
{
    public static string CurrentSid() => WindowsIdentity.GetCurrent().User?.Value ?? throw new InvalidDataException("Current user identity unavailable.");
    public static string Name(string sid) => "mfe-browser-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sid))).ToLowerInvariant()[..32];
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityInfo(IntPtr handle, int type, uint information, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);

    // Inspect CurrentUserOnly's actual DACL. Some older runtimes use the token
    // owner SID; fail closed when that is not the actual current user SID.
    public static void RestrictAndAssert(NamedPipeServerStream pipe, string sid)
    {
        var status = GetSecurityInfo(pipe.SafePipeHandle.DangerousGetHandle(), 6, 4, out _, out _, out _, out _, out var descriptor);
        if (status != 0 || descriptor == IntPtr.Zero) throw new InvalidDataException("Pipe ACL readback failed.");
        try
        {
            var actual = new byte[GetSecurityDescriptorLength(descriptor)]; Marshal.Copy(descriptor, actual, 0, actual.Length);
            var parsed = new RawSecurityDescriptor(actual, 0);
            if (parsed.DiscretionaryAcl is not { Count: 1 } acl || acl[0] is not CommonAce ace
                || ace.AceQualifier != AceQualifier.AccessAllowed || ace.SecurityIdentifier.Value != sid
                || ace.AceFlags != AceFlags.None || (ace.AccessMask & 3) != 3)
                throw new InvalidDataException("Pipe ACL does not restrict access to the current user.");
        }
        finally { LocalFree(descriptor); }
    }
}

public static class Program
{
    static readonly Regex Origin = new(@"^chrome-extension://[a-p]{32}/$", RegexOptions.CultureInvariant);
    static HashSet<string> Allowed()
    {
        var configPath = Path.Combine(AppContext.BaseDirectory, "browser-host-config.json");
        return ParseAllowed(File.ReadAllBytes(configPath));
    }
    internal static HashSet<string> ParseAllowed(byte[] bytes)
    {
        if (bytes.Length > 8192) throw new InvalidDataException("Host configuration exceeds its limit.");
        using var config = JsonDocument.Parse(bytes);
        var root = config.RootElement;
        NativeFrames.Validate(root);
        if (!NativeFrames.Exact(root, "schemaVersion", "host", "allowedOrigins", "identity") || root.GetProperty("schemaVersion").GetInt32() != 1
            || root.GetProperty("host").GetString() != "org.dingding.material_file_encryptor.downloads") throw new InvalidDataException("Invalid host configuration.");
        var origins = root.GetProperty("allowedOrigins").EnumerateArray().Select(row => row.GetString() ?? "").ToHashSet(StringComparer.Ordinal);
        var identity = root.GetProperty("identity");
        if (!NativeFrames.Exact(identity, "extensionId", "packageSha256", "publicKeySha256")
            || !Regex.IsMatch(identity.GetProperty("extensionId").GetString() ?? "", @"^[a-p]{32}$")
            || !Regex.IsMatch(identity.GetProperty("packageSha256").GetString() ?? "", @"^(?:[a-f0-9]{64}|unpacked)$")
            || !Regex.IsMatch(identity.GetProperty("publicKeySha256").GetString() ?? "", @"^[a-f0-9]{64}$")
            || ExtensionIdFromKeyHash(identity.GetProperty("publicKeySha256").GetString()!) != identity.GetProperty("extensionId").GetString()
            || origins.Count != 1 || root.GetProperty("allowedOrigins").GetArrayLength() != 1
            || origins.Any(row => !Origin.IsMatch(row)) || !origins.Contains($"chrome-extension://{identity.GetProperty("extensionId").GetString()}/"))
            throw new InvalidDataException("Reviewed extension identity unavailable.");
        return origins;
    }
    // An unpacked extension has no package to hash, so its config says "unpacked"; its identity is the public key.
    // Chromium derives the extension id from the first 32 hex digits of SHA-256(public key), mapped 0-f to a-p.
    internal static string ExtensionIdFromKeyHash(string publicKeySha256) => new string(publicKeySha256[..32].Select(c => (char)('a' + Convert.ToInt32(c.ToString(), 16))).ToArray());
    public static async Task<int> Main(string[] args)
    {
        try
        {
            if (!OperatingSystem.IsWindows()) throw new InvalidDataException("The native browser host requires Windows.");
            if (args.Length == 1 && args[0] == "--self-test") return await NativeChecks.Run();
            var allowed = Allowed(); var sid = PipeIdentity.CurrentSid(); var name = PipeIdentity.Name(sid);
            if (args.Length == 1 && args[0] == "--broker") return await Broker(allowed, sid, name);
            if (args.Length is < 1 or > 2 || !allowed.Contains(args[0]) || args.Length == 2 && !Regex.IsMatch(args[1], @"^--parent-window=\d{1,20}$"))
                throw new InvalidDataException("Browser caller is not allowed.");
            using var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            using var connecting = new CancellationTokenSource(TimeSpan.FromSeconds(5)); await pipe.ConnectAsync(connecting.Token);
            return await Relay(Console.OpenStandardInput(), pipe, Console.OpenStandardOutput(), args[0]);
        }
        catch (Exception error)
        {
            // Neither payloads nor origin/session credentials reach stderr.
            if (args.Length == 1 && args[0] == "--self-test") Console.Error.WriteLine("Synthetic check: " + error.GetType().Name + ": " + error.Message);
            Console.Error.WriteLine("Native browser handoff unavailable."); return 1;
        }
    }

    // Browser side of one native connection. Requests stay strictly sequential: one request, then its one reply. A desktop revoke notice
    // can arrive at any time, including while the browser is idle, so a pump reads the pipe continuously and forwards a notice straight
    // to the browser while handing every other frame to the request that is waiting for it.
    public static async Task<int> Relay(Stream input, Stream pipe, Stream output, string origin)
    {
        using var outputLock = new SemaphoreSlim(1); using var stop = new CancellationTokenSource();
        TaskCompletionSource<JsonElement>? waiting = null;
        var pump = Task.Run(async () =>
        {
            try
            {
                while (true)
                {
                    var frame = await NativeFrames.Read(pipe, stop.Token);
                    if (frame is null) break;
                    if (NativeFrames.IsRevokedNotice(frame.Value))
                    {
                        await outputLock.WaitAsync(stop.Token);
                        try { await NativeFrames.Write(output, frame.Value, stop.Token); } finally { outputLock.Release(); }
                        continue;
                    }
                    var owner = Interlocked.Exchange(ref waiting, null) ?? throw new InvalidDataException("Unexpected desktop frame.");
                    owner.TrySetResult(frame.Value);
                }
                Interlocked.Exchange(ref waiting, null)?.TrySetException(new EndOfStreamException());
            }
            catch (Exception error) { Interlocked.Exchange(ref waiting, null)?.TrySetException(error); }
        });
        try
        {
            for (var count = 0; count < 256; count++)
            {
                using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(16));
                var message = await NativeFrames.Read(input, deadline.Token); if (message is null) return 0;
                var reply = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously); waiting = reply;
                await NativeFrames.Write(pipe, new { origin, message = message.Value }, deadline.Token);
                var answer = await reply.Task.WaitAsync(deadline.Token);
                await outputLock.WaitAsync(deadline.Token);
                try { await NativeFrames.Write(output, answer, deadline.Token); } finally { outputLock.Release(); }
            }
            throw new InvalidDataException("Native connection request limit reached.");
        }
        finally { stop.Cancel(); try { await pump; } catch { } }
    }

    static async Task<int> Broker(HashSet<string> allowed, string sid, string name)
    {
        using var shutdown = new CancellationTokenSource(); var cancel = shutdown.Token;
        var input = Console.OpenStandardInput(); var output = Console.OpenStandardOutput();
        var replies = new ConcurrentDictionary<string, TaskCompletionSource<JsonElement>>();
        var abandonedReplies = new ConcurrentDictionary<string, byte>();
        var responseState = new object();
        // Every admitted browser pipe with the lock that serializes its writes, so a revoke notice never interleaves with a reply frame.
        var live = new ConcurrentDictionary<string, (NamedPipeServerStream Pipe, SemaphoreSlim Lock)>();
        using var writer = new SemaphoreSlim(1);
        async Task Send(object value)
        { await writer.WaitAsync(cancel); try { await NativeFrames.Write(output, value, cancel); } finally { writer.Release(); } }
        async Task Listen(bool first)
        {
            while (!cancel.IsCancellationRequested)
            {
                using var server = new NamedPipeServerStream(name, PipeDirection.InOut, 2, PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly | (first ? PipeOptions.FirstPipeInstance : PipeOptions.None));
                PipeIdentity.RestrictAndAssert(server, sid);
                if (first) { await Send(new { type = "ready", aclVerified = true }); }
                first = false;
                await server.WaitForConnectionAsync(cancel);
                // This identity belongs to the admitted pipe, never browser JSON.
                var connectionId = Guid.NewGuid().ToString();
                using var pipeLock = new SemaphoreSlim(1); live[connectionId] = (server, pipeLock);
                try
                {
                    for (var count = 0; count < 256; count++)
                    {
                        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel); deadline.CancelAfter(TimeSpan.FromSeconds(35));
                        var envelope = await NativeFrames.Read(server, deadline.Token); if (envelope is null) break;
                        if (!NativeFrames.Exact(envelope.Value, "origin", "message") || !allowed.Contains(envelope.Value.GetProperty("origin").GetString() ?? ""))
                            throw new InvalidDataException("Browser caller is not allowed.");
                        var id = Guid.NewGuid().ToString(); var pending = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
                        if (abandonedReplies.Count >= 256) throw new InvalidDataException("Native pending response limit reached.");
                        if (!replies.TryAdd(id, pending)) throw new InvalidDataException("Duplicate broker request.");
                        try
                        {
                            await Send(new { requestId = id, connectionId, origin = envelope.Value.GetProperty("origin"), message = envelope.Value.GetProperty("message") });
                            // Requests are sequential. Detect an EOF while consent
                            // is pending; pipelined bytes are rejected rather than
                            // interpreted as another request under this authority.
                            using var monitor = CancellationTokenSource.CreateLinkedTokenSource(deadline.Token);
                            var disconnected = server.ReadAsync(new byte[1], monitor.Token).AsTask();
                            try
                            {
                                await Task.WhenAny(pending.Task, disconnected).WaitAsync(deadline.Token);
                                if (disconnected.IsCompleted) { await disconnected; throw new IOException("Native connection closed or pipelined."); }
                                var result = await pending.Task.WaitAsync(deadline.Token);
                                monitor.Cancel();
                                try { await disconnected; throw new IOException("Native connection closed or pipelined."); }
                                catch (OperationCanceledException) when (!deadline.IsCancellationRequested) { }
                                await pipeLock.WaitAsync(deadline.Token);
                                try { await NativeFrames.Write(server, result, deadline.Token); } finally { pipeLock.Release(); }
                            }
                            finally { monitor.Cancel(); }
                        }
                        finally { lock (responseState) { if (!pending.Task.IsCompleted) abandonedReplies.TryAdd(id, 0); replies.TryRemove(id, out _); } }
                    }
                }
                catch (Exception error) when (error is IOException or InvalidDataException or OperationCanceledException or JsonException) { }
                finally { live.TryRemove(connectionId, out _); if (!cancel.IsCancellationRequested) await Send(new { type = "disconnected", connectionId }); }
            }
        }
        var firstListener = Listen(true);
        // The first pipe must exist before the second instance is created.
        await Task.Yield(); var secondListener = Listen(false);
        var reader = Task.Run(async () =>
        {
            try
            {
                while (!cancel.IsCancellationRequested)
                {
                    var response = await NativeFrames.Read(input, cancel); if (response is null) break;
                    if (NativeFrames.IsRevokedNotice(response.Value))
                    {
                        // Deliver the notice to every live browser pipe, each within a short bound, then confirm to the desktop how many received it.
                        var reason = response.Value.GetProperty("reason").GetString();
                        var delivered = await Task.WhenAll(live.Values.ToArray().Select(async item =>
                        {
                            using var limit = CancellationTokenSource.CreateLinkedTokenSource(cancel); limit.CancelAfter(TimeSpan.FromMilliseconds(150));
                            try
                            {
                                await item.Lock.WaitAsync(limit.Token);
                                try { await NativeFrames.Write(item.Pipe, new { type = "revoked", reason }, limit.Token); } finally { item.Lock.Release(); }
                                return 1;
                            }
                            catch (Exception error) when (error is IOException or ObjectDisposedException or OperationCanceledException or InvalidOperationException) { return 0; }
                        }));
                        await Send(new { type = "notified", count = delivered.Sum() });
                        continue;
                    }
                    if (!NativeFrames.Exact(response.Value, "requestId", "response")) throw new InvalidDataException("Invalid broker reply.");
                    var id = response.Value.GetProperty("requestId").GetString();
                    lock (responseState)
                    {
                        if (id is null) throw new InvalidDataException("Unmatched broker reply.");
                        if (!replies.TryGetValue(id, out var pending))
                        {
                            if (abandonedReplies.TryRemove(id, out _)) continue;
                            throw new InvalidDataException("Unmatched broker reply.");
                        }
                        pending.TrySetResult(response.Value.GetProperty("response"));
                    }
                }
            }
            finally { shutdown.Cancel(); }
        });
        try { await Task.WhenAny(firstListener, secondListener, reader); }
        finally
        {
            shutdown.Cancel(); foreach (var item in replies.Values) item.TrySetCanceled();
            try { await Task.WhenAll(firstListener, secondListener, reader); } catch (OperationCanceledException) { }
        }
        return 0;
    }
}
