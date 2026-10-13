using MaterialFileEncryptor.Core;
static class ProcessDeadlineChecks
{
    public static async Task VerifyAsync()
    {
        var never = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var runner = new VaultProcessRunner(copyOutput: (_, _, _) => never.Task);
        using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
        try
        {
            await runner.RunAsync("git", ["--version"], Path.GetTempPath(), cancellation.Token).WaitAsync(TimeSpan.FromSeconds(1));
            throw new InvalidOperationException("Cancellation was not reported.");
        }
        catch (OperationCanceledException) { }
    }
}
