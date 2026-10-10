using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using MaterialFileEncryptor.Core;

internal static class NativeChildTraceTests
{
    internal static async Task ChildAsync(string mode)
    {
        if (mode == "held") await Task.Delay(350);
        else if (mode == "cancel") await Task.Delay(30000);
        else if (mode != "short") throw new ArgumentException("Unknown synthetic mode.");
    }

    internal static async Task RunAsync(string[] args)
    {
        if (!OperatingSystem.IsWindows() || args.Length != 2) throw new ArgumentException("Windows diagnostic requires one private output file.");
        var expected = NativeChildTrace.CurrentHost();
        var checks = 0;
        void Check(bool condition, string label) { if (!condition) throw new InvalidOperationException(label); checks++; }
        try { _ = new NativeChildTrace(expected with { CreationFileTime = "1" }); throw new Exception("Accepted identity mismatch."); }
        catch (InvalidOperationException) { checks++; }
        var trace = new NativeChildTrace(expected);
        var runner = new VaultProcessRunner(diagnostic: trace);
        var executable = Environment.ProcessPath!;
        var assembly = typeof(NativeChildTraceTests).Assembly.Location;
        string[] Arguments(string mode) => Path.GetFileNameWithoutExtension(executable) == "dotnet" ? [assembly, "--native-trace-child", mode] : ["--native-trace-child", mode];
        foreach (var mode in new[] { "short", "held" })
        {
            var result = await runner.RunAsync(executable, Arguments(mode), Environment.CurrentDirectory);
            Check(result.ExitCode == 0 && result.Output.Length == 0 && result.Error.Length == 0, "Synthetic child result changed.");
        }
        using (var cancellation = new CancellationTokenSource(500))
        {
            try { await runner.RunAsync(executable, Arguments("cancel"), Environment.CurrentDirectory, cancellation.Token); throw new Exception("Cancellation ignored."); }
            catch (OperationCanceledException) { checks++; }
        }
        var bytes = trace.Finish();
        Check(bytes.Length <= NativeChildTrace.MaximumBytes, "Receipt exceeds byte limit.");
        var receipt = JsonSerializer.Deserialize<NativeChildTraceReceipt>(bytes)!;
        Check(receipt.Complete && receipt.HandlesClosed && receipt.Children.Length == 3 && receipt.Host == expected, "Trace incomplete.");
        foreach (var row in receipt.Children)
        {
            Check(row.Category == NativeChildCategory.SyntheticProbe && row.HostPid == expected.Pid && row.ChildPid > 0, "Invalid fixed identity fields.");
            Check(row.Started.TimesOk && row.Finished.TimesOk && row.Started.CreationFileTime == row.Finished.CreationFileTime, "Retained creation identity changed.");
            Check(row.Finished.WaitResult == 0 && row.Finished.ExitCodeOk && long.Parse(row.Finished.ExitFileTime!, CultureInfo.InvariantCulture) >= long.Parse(row.Finished.CreationFileTime!, CultureInfo.InvariantCulture), "Retained exit identity unavailable.");
            Check(string.CompareOrdinal(row.Started.StartedUtc, row.Finished.EndedUtc) <= 0 && long.Parse(row.Started.StartedMonotonic) <= long.Parse(row.Finished.EndedMonotonic), "Observation interval reversed.");
        }
        Check(receipt.Children[1].Started.WaitResult == 258, "Held child did not supply live observation.");
        var sinkFault = new NativeChildTrace(expected, _ => throw new InvalidOperationException("not-recorded"));
        var faultResult = await new VaultProcessRunner(diagnostic: sinkFault).RunAsync(executable, Arguments("short"), Environment.CurrentDirectory);
        var faultBytes = sinkFault.Finish();
        var faultReceipt = JsonSerializer.Deserialize<NativeChildTraceReceipt>(faultBytes)!;
        Check(faultResult.ExitCode == 0 && !faultReceipt.Complete && faultReceipt.IncompleteReasons.Contains("sink-fault"), "Sink fault changed runner or escaped receipt.");
        Check(!Encoding.UTF8.GetString(faultBytes).Contains("not-recorded", StringComparison.Ordinal), "Sink exception message leaked.");
        var overflow = new NativeChildTrace(expected);
        using (var self = Process.GetCurrentProcess())
        {
            // Exercise the sink's count bound without starting 129 processes.
            var begin = typeof(NativeChildTrace).GetMethod("Begin", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!;
            for (var i = 0; i <= NativeChildTrace.MaximumChildren; i++) (begin.Invoke(overflow, [self]) as IDisposable)?.Dispose();
        }
        var overflowBytes = overflow.Finish();
        var overflowReceipt = JsonSerializer.Deserialize<NativeChildTraceReceipt>(overflowBytes)!;
        Check(!overflowReceipt.Complete && overflowBytes.Length <= NativeChildTrace.MaximumBytes && overflowReceipt.IncompleteReasons.Contains("child-limit") && overflowReceipt.IncompleteReasons.Contains("byte-limit"), "Overflow not explicit.");
        var expired = new NativeChildTrace(expected);
        typeof(NativeChildTrace).GetField("began", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.SetValue(expired, Stopwatch.GetTimestamp() - Stopwatch.Frequency * 61);
        var expiredReceipt = JsonSerializer.Deserialize<NativeChildTraceReceipt>(expired.Finish())!;
        Check(!expiredReceipt.Complete && expiredReceipt.IncompleteReasons.Contains("deadline"), "Expired observation window accepted.");
        var activeTrace = new NativeChildTrace(expected);
        using (var self = Process.GetCurrentProcess())
        using (var lease = (IDisposable)typeof(NativeChildTrace).GetMethod("Begin", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic)!.Invoke(activeTrace, [self])!)
        {
            var activeReceipt = JsonSerializer.Deserialize<NativeChildTraceReceipt>(activeTrace.Finish())!;
            Check(!activeReceipt.Complete && !activeReceipt.HandlesClosed && activeReceipt.IncompleteReasons.Contains("active-children") && activeReceipt.IncompleteReasons.Contains("handles-open"), "Active handle reported closed.");
        }
        using var json = JsonDocument.Parse(bytes);
        void Fields(JsonElement value, params string[] allowed) => Check(value.EnumerateObject().Select(x => x.Name).Order().SequenceEqual(allowed.Order()), "Unexpected private schema field.");
        Fields(json.RootElement, "Version", "Host", "MonotonicFrequency", "Complete", "HandlesClosed", "IncompleteReasons", "Children");
        Fields(json.RootElement.GetProperty("Host"), "Pid", "CreationFileTime");
        foreach (var row in json.RootElement.GetProperty("Children").EnumerateArray())
        {
            Fields(row, "Sequence", "Category", "HostPid", "ChildPid", "Started", "Finished");
            foreach (var point in new[] { row.GetProperty("Started"), row.GetProperty("Finished") }) Fields(point, "StartedUtc", "EndedUtc", "StartedMonotonic", "EndedMonotonic", "TimesOk", "TimesError", "CreationFileTime", "ExitFileTime", "WaitResult", "WaitError", "ExitCodeOk", "ExitCodeError", "ExitCode");
        }
        var text = Encoding.UTF8.GetString(bytes);
        Check(!text.Contains(Environment.CurrentDirectory, StringComparison.OrdinalIgnoreCase) && !text.Contains(assembly, StringComparison.OrdinalIgnoreCase) && !text.Contains("--native-trace-child", StringComparison.Ordinal) && !text.Contains("not-recorded", StringComparison.Ordinal), "Command payload leaked.");
        using (var destination = new FileStream(args[1], FileMode.CreateNew, FileAccess.Write, FileShare.None)) { destination.Write(bytes); destination.Flush(true); }
        Console.WriteLine($"PASS: {checks} synthetic direct-child diagnostic checks.");
    }
}
