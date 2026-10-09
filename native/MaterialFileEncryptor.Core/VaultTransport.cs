using System.Text.Json;
namespace MaterialFileEncryptor.Core;

public interface IVaultTransport
{
    Task InitializeAsync(CancellationToken cancellationToken = default);
    Task SyncAsync(CancellationToken cancellationToken = default);
    Task EnsureFileAsync(string relativePath, CancellationToken cancellationToken = default);
}

/// <summary>A folder transport leaves the synchronized folder free of mutable Git state.</summary>
public sealed class FolderVaultTransport(string sourceRoot) : IVaultTransport
{
    public Task InitializeAsync(CancellationToken cancellationToken = default) { GitVaultHistory.CheckPath(Path.GetFullPath(sourceRoot)); return Task.CompletedTask; }
    public Task SyncAsync(CancellationToken cancellationToken = default) => InitializeAsync(cancellationToken);
    public Task EnsureFileAsync(string relativePath, CancellationToken cancellationToken = default)
    {
        var path = Path.Combine(sourceRoot, GitVaultHistory.ValidateRelativePath(relativePath)); GitVaultHistory.CheckPath(path);
        if (!File.Exists(path)) throw new FileNotFoundException("Encrypted object is unavailable.");
        return Task.CompletedTask;
    }
}

/// <summary>Private GitHub transport using a partial clone and metadata-only sparse checkout.</summary>
public sealed class PrivateGitHubVaultTransport : IVaultTransport
{
    private readonly GitVaultHistory history;
    private readonly string repository;
    private bool ready;
    public PrivateGitHubVaultTransport(string sourceRoot, string historyRoot, string repository, IVaultProcessRunner? runner = null)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(repository, @"\A[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*\z")) throw new ArgumentException("Use an owner/repository identifier.");
        this.repository = repository; history = new(sourceRoot, historyRoot, runner);
    }
    public GitVaultHistory History => history;
    private async Task ValidatePrivate(CancellationToken ct)
    {
        Directory.CreateDirectory(history.HistoryRoot);
        var result = await history.Runner.RunAsync("gh", ["repo", "view", repository, "--json", "isPrivate"], history.HistoryRoot, ct);
        if (result.ExitCode != 0) throw new IOException("Private repository access could not be verified. Sign in with GitHub CLI.");
        using var json = JsonDocument.Parse(result.Output);
        if (!json.RootElement.GetProperty("isPrivate").GetBoolean()) throw new InvalidOperationException("Vault storage requires a private repository.");
    }
    public async Task InitializeAsync(CancellationToken ct = default)
    {
        if (ready) return;
        await ValidatePrivate(ct);
        if (!Directory.Exists(Path.Combine(history.HistoryRoot, ".git")))
        {
            var clone = await history.Runner.RunAsync("git", ["clone", "--filter=blob:none", "--no-checkout", "https://github.com/" + repository + ".git", "."], history.HistoryRoot, ct);
            if (clone.ExitCode != 0) throw new IOException("Private repository clone failed.");
            if (clone.Error.Contains("filtering not recognized", StringComparison.OrdinalIgnoreCase) || clone.Error.Contains("does not support", StringComparison.OrdinalIgnoreCase)) throw new NotSupportedException("Server does not support lazy Git object fetching.");
        }
        var promisor = await history.Runner.RunAsync("git", ["config", "--get", "remote.origin.promisor"], history.HistoryRoot, ct);
        var filter = await history.Runner.RunAsync("git", ["config", "--get", "remote.origin.partialclonefilter"], history.HistoryRoot, ct);
        if (promisor.Text.Trim() != "true" || filter.Text.Trim() != "blob:none") throw new NotSupportedException("Repository must be a blob:none partial clone to preserve lazy retrieval.");
        var origin = await history.Runner.RunAsync("git", ["remote", "get-url", "origin"], history.HistoryRoot, ct);
        if (origin.ExitCode != 0 || origin.Text.Trim() != "https://github.com/" + repository + ".git") throw new InvalidOperationException("Repository origin does not match the selected private repository.");
        await history.InitializeAsync(ct);
        await history.Git(ct, "sparse-checkout", "init", "--cone");
        await history.Git(ct, "sparse-checkout", "set", "commits");
        var head = await history.Runner.RunAsync("git", ["rev-parse", "--verify", "HEAD"], history.HistoryRoot, ct);
        if (head.ExitCode == 0) await history.Git(ct, "checkout", "main");
        ready = true;
    }
    public async Task SyncAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        await ValidatePrivate(ct);
        var fetch = await history.Git(ct, "fetch", "--filter=blob:none", "origin");
        if (fetch.Error.Contains("filtering not recognized", StringComparison.OrdinalIgnoreCase) || fetch.Error.Contains("does not support", StringComparison.OrdinalIgnoreCase)) throw new NotSupportedException("Server does not support lazy Git object fetching.");
        var remoteTree = await history.Runner.RunAsync("git", ["ls-tree", "-r", "--name-only", "origin/main"], history.HistoryRoot, ct);
        if (remoteTree.ExitCode == 0) foreach (var path in remoteTree.Text.Split('\n', StringSplitOptions.RemoveEmptyEntries)) GitVaultHistory.ValidateRelativePath(path);
        var remote = await history.Runner.RunAsync("git", ["rev-parse", "--verify", "refs/remotes/origin/main"], history.HistoryRoot, ct);
        if (remote.ExitCode == 0)
        {
            var local = await history.Runner.RunAsync("git", ["rev-parse", "--verify", "HEAD"], history.HistoryRoot, ct);
            if (local.ExitCode == 0) await history.Git(ct, "merge", "--no-edit", "--no-verify", "-m", "Merge encrypted snapshots", "origin/main");
            else await history.Git(ct, "checkout", "-B", "main", "origin/main");
        }
        // Copy only metadata. Payload blobs remain in the promisor store until requested.
        var head = await history.Runner.RunAsync("git", ["rev-parse", "--verify", "HEAD"], history.HistoryRoot, ct);
        if (head.ExitCode != 0) return;
        var paths = (await history.Git(ct, "ls-tree", "-r", "--name-only", "HEAD")).Text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var path in paths.Where(p => p == "vault.json" || p.StartsWith("commits/", StringComparison.Ordinal))) await EnsureFileAsync(path, ct);
        await ValidatePrivate(ct);
        await history.Git(ct, "push", "origin", "HEAD:refs/heads/main");
    }
    public async Task EnsureFileAsync(string relativePath, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        relativePath = GitVaultHistory.ValidateRelativePath(relativePath);
        var destination = Path.Combine(history.SourceRoot, relativePath); GitVaultHistory.CheckPath(destination);
        if (File.Exists(destination) && relativePath.StartsWith("parts/", StringComparison.Ordinal)) return;
        var bytes = (await history.Git(ct, "show", "HEAD:" + relativePath)).Output;
        if (File.Exists(destination))
        {
            using var existing = File.OpenRead(destination);
            if (!System.Security.Cryptography.SHA256.HashData(existing).SequenceEqual(System.Security.Cryptography.SHA256.HashData(bytes))) throw new InvalidDataException("Immutable remote metadata collision or different vault header.");
            return;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
        var temporary = destination + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try { await File.WriteAllBytesAsync(temporary, bytes, ct); File.Move(temporary, destination, false); }
        catch (IOException) when (File.Exists(destination)) { }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}


