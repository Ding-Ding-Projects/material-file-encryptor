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
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        await Task.WhenAll(server.WaitForConnectionAsync(timeout.Token), client.ConnectAsync(timeout.Token));
        await NativeFrames.Write(client, new { fixture = true }, timeout.Token);
        if ((await NativeFrames.Read(server, timeout.Token))?.GetProperty("fixture").GetBoolean() != true) throw new InvalidDataException("Same-user pipe round trip failed.");
        checks++;
        Console.WriteLine($"PASS: {checks} synthetic native framing and same-user pipe checks. No installation or browser profile was changed.");
        return 0;
    }
}
