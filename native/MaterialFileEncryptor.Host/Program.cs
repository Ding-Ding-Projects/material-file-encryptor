using System.Security.Cryptography;
using System.Text.Json;
using MaterialFileEncryptor.Host;

internal static class Program
{
    private static readonly object outputGate = new();
    private static void Send(object value)
    {
        lock (outputGate) { Console.Out.WriteLine(JsonSerializer.Serialize(value)); Console.Out.Flush(); }
    }
    private static string SafeError(Exception error) => error switch
    {
        CryptographicException => "Unlock failed. Check your password or key file; encrypted data may also be damaged.",
        FileNotFoundException or DirectoryNotFoundException => "The selected file or encrypted vault could not be found.",
        UnauthorizedAccessException => "Access was denied. Check folder and file permissions.",
        InvalidDataException => "The encrypted vault or saved unlock data is invalid or damaged.",
        IOException => "The encrypted storage operation failed. Check folder availability and free space, then retry.",
        ArgumentException or JsonException or OverflowException => "Invalid request. Check the selected folders, credential type, drive letter, and part size.",
        InvalidOperationException => error.Message,
        PlatformNotSupportedException => "This operation requires Windows.",
        _ => "The encrypted filesystem operation failed. Retry after checking storage availability."
    };
    public static async Task<int> Main(string[] args)
    {
        if (args.Contains("--self-test", StringComparer.Ordinal)) return await WindowsSelfTest.RunAsync();
        int exitCode = 0;
        var controller = new VaultController();
        if (args.Contains("--driver-check", StringComparer.Ordinal))
        {
            var driver = JsonSerializer.SerializeToElement(controller.Status()).GetProperty("driver");
            Send(new { driver });
            controller.Dispose();
            return driver.GetProperty("available").GetBoolean() ? 0 : 1;
        }
        using var cancellation = new CancellationTokenSource();
        Task background = Task.Run(async () =>
        {
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
            try
            {
                while (await timer.WaitForNextTickAsync(cancellation.Token))
                {
                    try { controller.TickIfUnlocked(); Send(new { @event = "status", status = controller.Status() }); }
                    catch { try { Send(new { @event = "status", status = controller.Status() }); } catch { } }
                }
            }
            catch (OperationCanceledException) { }
        });
        Send(new { @event = "status", status = controller.Status() });
        var requests = new List<Task>();
        try
        {
            string? line;
            while ((line = await Console.In.ReadLineAsync()) is not null)
            {
                JsonElement? id = null;
                try
                {
                    if (line.Length > 1048576) throw new ArgumentException("Request exceeds limit.");
                    using var request = JsonDocument.Parse(line, new JsonDocumentOptions { MaxDepth = 32 });
                    if (request.RootElement.TryGetProperty("id", out var suppliedId))
                    {
                        if (suppliedId.ValueKind != JsonValueKind.Number && (suppliedId.ValueKind != JsonValueKind.String || suppliedId.GetString()!.Length > 64)) throw new ArgumentException();
                        id = suppliedId.Clone();
                    }
                    string method = request.RootElement.GetProperty("method").GetString() ?? throw new ArgumentException();
                    JsonElement parameters = request.RootElement.TryGetProperty("params", out var supplied) ? supplied : default;
                    JsonElement? responseId = id;
                    // Clone before disposing the parsed request. Dispatch registers
                    // admission immediately but never blocks the stdin reader.
                    Task<object?> pending = controller.DispatchAsync(method, parameters.ValueKind == JsonValueKind.Undefined ? default : parameters.Clone());
                    requests.RemoveAll(task => task.IsCompleted);
                    requests.Add(pending.ContinueWith(task =>
                    {
                        if (task.IsCompletedSuccessfully) Send(new { id = responseId, result = task.Result });
                        else Send(new { id = responseId, error = SafeError(task.Exception?.GetBaseException() ?? new InvalidOperationException("Request cancelled.")) });
                    }, TaskScheduler.Default));
                }
                catch (Exception error) { Send(new { id, error = SafeError(error) }); }
            }
        }
        finally
        {
            await Task.WhenAll(requests);
            cancellation.Cancel(); await background;
            // EOF is an orderly parent shutdown. Preserve a busy mount until its
            // application handles close; successful writes are already journaled.
            while (true)
            {
                try { controller.Dispose(); break; }
                catch (InvalidOperationException) { Console.Error.WriteLine("Waiting for encrypted drive handles to close before shutdown."); await Task.Delay(1000); }
                catch { Console.Error.WriteLine("Encrypted shutdown could not complete; the local encrypted journal is retained."); exitCode = 1; break; }
            }
        }
        return exitCode;
    }
}
