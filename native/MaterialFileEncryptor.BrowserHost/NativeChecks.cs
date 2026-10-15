using System.Buffers.Binary;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;

namespace MaterialFileEncryptor.BrowserHost;

public static class NativeChecks
{
    public static async Task<int> Run()
    {
        var checks = 0;
        async Task Reject(byte[] bytes)
        {
            try { await NativeFrames.Read(new MemoryStream(bytes), CancellationToken.None); }
            catch (Exception error) when (error is InvalidDataException or EndOfStreamException or DecoderFallbackException or JsonException)
            { checks++; return; }
            throw new InvalidDataException("Invalid native frame was accepted.");
        }
        byte[] Frame(byte[] body)
        { var result = new byte[body.Length + 4]; BinaryPrimitives.WriteUInt32LittleEndian(result, (uint)body.Length); body.CopyTo(result, 4); return result; }
        await Reject(new byte[] { 0, 0, 0, 0 });
        await Reject(new byte[] { 1, 0, 1, 0 });
        await Reject(new byte[] { 2, 0 });
        await Reject(new byte[] { 20, 0, 0, 0, 123 });
        await Reject(Frame(new byte[] { 0xff }));
        await Reject(Frame(Encoding.UTF8.GetBytes("{\"type\":\"pair\",\"type\":\"propose\"}")));
        await Reject(Frame(Encoding.UTF8.GetBytes("{\"nested\":{\"__proto__\":{}}}")));
        using var memory = new MemoryStream();
        await NativeFrames.Write(memory, new { type = "pair" }, CancellationToken.None); memory.Position = 0;
        if ((await NativeFrames.Read(memory, CancellationToken.None))?.GetProperty("type").GetString() != "pair") throw new InvalidDataException("Native frame round trip failed.");
        checks++;
        var sid = PipeIdentity.CurrentSid(); var pipeName = PipeIdentity.Name(sid) + "-fixture-" + Guid.NewGuid().ToString("N");
        using var server = new NamedPipeServerStream(pipeName, PipeDirection.InOut, 1, PipeTransmissionMode.Byte, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly | PipeOptions.FirstPipeInstance);
        PipeIdentity.RestrictAndAssert(server, sid); checks++;
        using var client = new NamedPipeClientStream(".", pipeName, PipeDirection.InOut, PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(15));
        Console.WriteLine("Synthetic framing and ACL checks passed; connecting the owned pipe fixture.");
        var serverConnection = server.WaitForConnectionAsync(timeout.Token);
        await client.ConnectAsync(timeout.Token);
        await serverConnection;
        Console.WriteLine("Synthetic pipe connection passed; verifying frame traffic.");
        var reading = NativeFrames.Read(server, timeout.Token);
        await NativeFrames.Write(client, new { fixture = true }, timeout.Token);
        if ((await reading)?.GetProperty("fixture").GetBoolean() != true) throw new InvalidDataException("Same-user pipe round trip failed.");
        checks++;
        // The revoke notice: only the exact secret-free shape with a known reason is recognized.
        JsonElement Parse(string text) { using var document = JsonDocument.Parse(text); return document.RootElement.Clone(); }
        foreach (var reason in new[] { "exit", "lock", "update" })
            if (!NativeFrames.IsRevokedNotice(Parse("{\"type\":\"revoked\",\"reason\":\"" + reason + "\"}"))) throw new InvalidDataException("Valid revoke notice was refused.");
        foreach (var bad in new[] { "{\"type\":\"revoked\"}", "{\"type\":\"revoked\",\"reason\":\"crash\"}", "{\"type\":\"revoked\",\"reason\":\"exit\",\"session\":\"x\"}", "{\"type\":\"resumed\",\"reason\":\"exit\"}", "{\"type\":\"revoked\",\"reason\":7}" })
            if (NativeFrames.IsRevokedNotice(Parse(bad))) throw new InvalidDataException("Invalid revoke notice was accepted.");
        checks++;
        // A notice written on the pipe while the browser is idle reaches the browser output without any request in flight, and a request
        // afterwards still gets exactly its own reply.
        using var browserInput = new AnonymousPipeServerStream(PipeDirection.Out); using var relayInput = new AnonymousPipeClientStream(PipeDirection.In, browserInput.ClientSafePipeHandle);
        using var browserOutput = new AnonymousPipeServerStream(PipeDirection.In); using var relayOutput = new AnonymousPipeClientStream(PipeDirection.Out, browserOutput.ClientSafePipeHandle);
        var relaying = Program.Relay(relayInput, client, relayOutput, "chrome-extension://fixture/");
        await NativeFrames.Write(server, new { type = "revoked", reason = "exit" }, timeout.Token);
        var relayed = await NativeFrames.Read(browserOutput, timeout.Token);
        if (relayed is null || !NativeFrames.IsRevokedNotice(relayed.Value) || relayed.Value.GetProperty("reason").GetString() != "exit") throw new InvalidDataException("Idle revoke notice was not relayed.");
        checks++;
        await NativeFrames.Write(browserInput, new { type = "status" }, timeout.Token);
        var asked = await NativeFrames.Read(server, timeout.Token);
        if (asked is null || asked.Value.GetProperty("message").GetProperty("type").GetString() != "status") throw new InvalidDataException("Relay request was not forwarded.");
        await NativeFrames.Write(server, new { type = "revoked", reason = "lock" }, timeout.Token);
        await NativeFrames.Write(server, new { type = "status", state = "ok" }, timeout.Token);
        var secondNotice = await NativeFrames.Read(browserOutput, timeout.Token);
        var reply = await NativeFrames.Read(browserOutput, timeout.Token);
        if (secondNotice is null || !NativeFrames.IsRevokedNotice(secondNotice.Value) || reply is null || reply.Value.GetProperty("state").GetString() != "ok")
            throw new InvalidDataException("A notice during a request must not replace its reply.");
        checks++;
        browserInput.Dispose();
        if (await relaying.WaitAsync(TimeSpan.FromSeconds(10), timeout.Token) != 0) throw new InvalidDataException("Relay did not end cleanly.");
        checks++;
        // Host configuration: an unpacked extension is accepted only when its id is derived from the reviewed public key.
        const string keyHash = "75010939dc224c7ea9d8fc0013fb9116465ad7de9e0102b5874259719b622c7f", extensionId = "hfabajdjnmccemhokjnipmaabdpljbbg";
        byte[] Config(string id, string package, string key) => Encoding.UTF8.GetBytes(
            "{\"schemaVersion\":1,\"host\":\"org.dingding.material_file_encryptor.downloads\",\"allowedOrigins\":[\"chrome-extension://" + id
            + "/\"],\"identity\":{\"extensionId\":\"" + id + "\",\"packageSha256\":\"" + package + "\",\"publicKeySha256\":\"" + key + "\"}}");
        void Accept(byte[] config) { if (!Program.ParseAllowed(config).Contains($"chrome-extension://{extensionId}/")) throw new InvalidDataException("Valid host configuration was refused."); checks++; }
        void RejectConfig(byte[] config)
        {
            try { Program.ParseAllowed(config); }
            catch (InvalidDataException) { checks++; return; }
            throw new InvalidDataException("Invalid host configuration was accepted.");
        }
        Accept(Config(extensionId, "unpacked", keyHash));
        Accept(Config(extensionId, new string('0', 64), keyHash));
        RejectConfig(Config(extensionId, "unpacked-extension", keyHash));
        RejectConfig(Config(new string('a', 32), "unpacked", keyHash));
        RejectConfig(Config(extensionId, "unpacked", new string('0', 64)));
        Console.WriteLine($"PASS: {checks} synthetic native framing, same-user pipe and host configuration checks. No installation or browser profile was changed.");
        return 0;
    }
}
