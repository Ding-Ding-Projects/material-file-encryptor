using System.Diagnostics;
using MaterialFileEncryptor.Core;
static class ProcessInputChecks
{
    public static async Task RunChildAsync()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var result = await new VaultProcessRunner().RunAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::In.ReadToEnd() | Out-Null"], Path.GetTempPath(), timeout.Token);
        if (result.ExitCode != 0) throw new InvalidOperationException("Owned stdin reader failed.");
    }
    public static async Task VerifyAsync()
    {
        if (!OperatingSystem.IsWindows()) return;
        var start = new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
        if (string.Equals(Path.GetFileNameWithoutExtension(Environment.ProcessPath), "dotnet", StringComparison.OrdinalIgnoreCase)) start.ArgumentList.Add(typeof(ProcessInputChecks).Assembly.Location);
        start.ArgumentList.Add("--stdin-eof-child");
        using var child = Process.Start(start) ?? throw new IOException("Owned parent-pipe fixture could not start.");
        var output = child.StandardOutput.ReadToEndAsync(); var error = child.StandardError.ReadToEndAsync();
        try
        {
            // Keep the parent's request pipe open deliberately. A storage tool
            // must receive an independent EOF instead of borrowing that pipe.
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(5));
            await child.WaitForExitAsync(timeout.Token);
            await Task.WhenAll(output, error);
            if (child.ExitCode != 0) throw new InvalidOperationException("Storage tool inherited the open parent request pipe.");
        }
        finally { child.StandardInput.Close(); if (!child.HasExited) { child.Kill(true); await child.WaitForExitAsync(); } }
    }
}
