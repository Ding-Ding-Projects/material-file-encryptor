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
}

public static class PipeIdentity
{
    public static string CurrentSid() => WindowsIdentity.GetCurrent().User?.Value ?? throw new InvalidDataException("Current user identity unavailable.");
    public static string Name(string sid) => "mfe-browser-" + Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(sid))).ToLowerInvariant()[..32];
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityInfo(IntPtr handle, int type, uint information, out IntPtr owner, out IntPtr group, out IntPtr dacl, out IntPtr sacl, out IntPtr descriptor);
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint SetSecurityInfo(IntPtr handle, int type, uint information, IntPtr owner, IntPtr group, IntPtr dacl, IntPtr sacl);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr value);
    [DllImport("advapi32.dll", SetLastError = true)] static extern uint GetSecurityDescriptorLength(IntPtr descriptor);

    // CurrentUserOnly in older .NET versions uses the token owner SID. Replace
    // that descriptor with the actual user SID and independently read it back.
    public static void RestrictAndAssert(NamedPipeServerStream pipe, string sid)
    {
        var desired = new RawSecurityDescriptor($"O:{sid}G:{sid}D:P(A;;FA;;;{sid})");
        var bytes = new byte[desired.BinaryLength]; desired.GetBinaryForm(bytes, 0);
        var pinned = GCHandle.Alloc(bytes, GCHandleType.Pinned);
        try
        {
            // GetSecurityDescriptorDacl extracts the ACL from the descriptor.
            if (!GetSecurityDescriptorDacl(pinned.AddrOfPinnedObject(), out var present, out var dacl, out _) || !present)
                throw new InvalidDataException("Pipe ACL unavailable.");
            if (SetSecurityInfo(pipe.SafePipeHandle.DangerousGetHandle(), 6, 4 | 0x80000000, IntPtr.Zero, IntPtr.Zero, dacl, IntPtr.Zero) != 0)
                throw new InvalidDataException("Pipe ACL restriction failed.");
        }
        finally { pinned.Free(); }
        var status = GetSecurityInfo(pipe.SafePipeHandle.DangerousGetHandle(), 6, 4, out _, out _, out _, out _, out var descriptor);
        if (status != 0 || descriptor == IntPtr.Zero) throw new InvalidDataException("Pipe ACL readback failed.");
        try
        {
            var actual = new byte[GetSecurityDescriptorLength(descriptor)]; Marshal.Copy(descriptor, actual, 0, actual.Length);
            var parsed = new RawSecurityDescriptor(actual, 0);
            if (parsed.DiscretionaryAcl is not { Count: 1 } acl || acl[0] is not CommonAce ace
                || ace.AceQualifier != AceQualifier.AccessAllowed || ace.SecurityIdentifier.Value != sid
                || ace.AceFlags != AceFlags.None || ace.AccessMask != 0x001F01FF)
                throw new InvalidDataException("Pipe ACL does not restrict access to the current user.");
        }
        finally { LocalFree(descriptor); }
    }
    [DllImport("advapi32.dll", SetLastError = true)] [return: MarshalAs(UnmanagedType.Bool)]
    static extern bool GetSecurityDescriptorDacl(IntPtr descriptor, [MarshalAs(UnmanagedType.Bool)] out bool present, out IntPtr dacl, [MarshalAs(UnmanagedType.Bool)] out bool defaulted);
}

public static class Program
{
    static readonly Regex Origin = new(@"^chrome-extension://[a-p]{32}/$", RegexOptions.CultureInvariant);
    static HashSet<string> Allowed()
    {
        var configPath = Path.Combine(AppContext.BaseDirectory, "browser-host-config.json");
        var bytes = File.ReadAllBytes(configPath);
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
            || !new[] { "packageSha256", "publicKeySha256" }.All(field => Regex.IsMatch(identity.GetProperty(field).GetString() ?? "", @"^[a-f0-9]{64}$"))
            || origins.Count != 1 || root.GetProperty("allowedOrigins").GetArrayLength() != 1
            || origins.Any(row => !Origin.IsMatch(row)) || !origins.Contains($"chrome-extension://{identity.GetProperty("extensionId").GetString()}/"))
            throw new InvalidDataException("Reviewed extension identity unavailable.");
        return origins;
    }
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
            var input = Console.OpenStandardInput(); var output = Console.OpenStandardOutput();
            for (var count = 0; count < 256; count++)
            {
                using var deadline = new CancellationTokenSource(TimeSpan.FromMinutes(16));
                var message = await NativeFrames.Read(input, deadline.Token); if (message is null) return 0;
                await NativeFrames.Write(pipe, new { origin = args[0], message = message.Value }, deadline.Token);
                var reply = await NativeFrames.Read(pipe, deadline.Token) ?? throw new EndOfStreamException();
                await NativeFrames.Write(output, reply, deadline.Token);
            }
            throw new InvalidDataException("Native connection request limit reached.");
        }
        catch
        {
            // Neither payloads nor origin/session credentials reach stderr.
            Console.Error.WriteLine("Native browser handoff unavailable."); return 1;
        }
    }

    static async Task<int> Broker(HashSet<string> allowed, string sid, string name)
    {
        using var shutdown = new CancellationTokenSource(); var cancel = shutdown.Token;
        var input = Console.OpenStandardInput(); var output = Console.OpenStandardOutput();
        var replies = new ConcurrentDictionary<string, TaskCompletionSource<JsonElement>>();
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
                try
                {
                    for (var count = 0; count < 256; count++)
                    {
                        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancel); deadline.CancelAfter(TimeSpan.FromSeconds(35));
                        var envelope = await NativeFrames.Read(server, deadline.Token); if (envelope is null) break;
                        if (!NativeFrames.Exact(envelope.Value, "origin", "message") || !allowed.Contains(envelope.Value.GetProperty("origin").GetString() ?? ""))
                            throw new InvalidDataException("Browser caller is not allowed.");
                        var id = Guid.NewGuid().ToString(); var pending = new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
                        if (!replies.TryAdd(id, pending)) throw new InvalidDataException("Duplicate broker request.");
                        try
                        {
                            await Send(new { requestId = id, origin = envelope.Value.GetProperty("origin"), message = envelope.Value.GetProperty("message") });
                            var result = await pending.Task.WaitAsync(deadline.Token); await NativeFrames.Write(server, result, deadline.Token);
                        }
                        finally { replies.TryRemove(id, out _); }
                    }
                }
                catch (Exception error) when (error is IOException or InvalidDataException or OperationCanceledException or JsonException) { }
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
                    if (!NativeFrames.Exact(response.Value, "requestId", "response")) throw new InvalidDataException("Invalid broker reply.");
                    var id = response.Value.GetProperty("requestId").GetString();
                    if (id is null || !replies.TryGetValue(id, out var pending)) throw new InvalidDataException("Unmatched broker reply.");
                    pending.TrySetResult(response.Value.GetProperty("response"));
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
