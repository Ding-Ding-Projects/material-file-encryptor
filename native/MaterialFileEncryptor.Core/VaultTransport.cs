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

/// <summary>Private GitHub transport using a partial clone and explicit metadata-only hydration.</summary>
public sealed class PrivateGitHubVaultTransport : IVaultTransport
{
    private readonly GitVaultHistory history;
    private readonly string repository;
    private bool ready;
    private HashSet<string> available = new(StringComparer.Ordinal);
    public bool ContainsFile(string relativePath) => available.Contains(GitVaultHistory.ValidateRelativePath(relativePath));
    public PrivateGitHubVaultTransport(string sourceRoot, string historyRoot, string repository, IVaultProcessRunner? runner = null, long publicationBudgetBytes = 1024L * 1024 * 1024)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(repository, @"\A[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*\z")) throw new ArgumentException("Use an owner/repository identifier.");
        this.repository = repository; history = new(sourceRoot, historyRoot, runner, publicationBudgetBytes);
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
        var cloned = false;
        await ValidatePrivate(ct);
        if (!Directory.Exists(Path.Combine(history.HistoryRoot, ".git")))
        {
            cloned = true;
            var clone = await history.Runner.RunAsync("git", ["clone", "--filter=blob:none", "--no-checkout", "https://github.com/" + repository + ".git", "."], history.HistoryRoot, ct);
            if (clone.ExitCode != 0) throw new IOException("Private repository clone failed.");
            if (clone.Error.Contains("filtering not recognized", StringComparison.OrdinalIgnoreCase) || clone.Error.Contains("does not support", StringComparison.OrdinalIgnoreCase)) throw new NotSupportedException("Server does not support lazy Git object fetching.");
        }
        var promisor = await history.Runner.RunAsync("git", ["config", "--get", "remote.origin.promisor"], history.HistoryRoot, ct);
        var filter = await history.Runner.RunAsync("git", ["config", "--get", "remote.origin.partialclonefilter"], history.HistoryRoot, ct);
        if (promisor.Text.Trim() != "true" || filter.Text.Trim() != "blob:none") throw new NotSupportedException("Repository must be a blob:none partial clone to preserve lazy retrieval.");
        await ValidateDestinations(ct);
        await history.InitializeAsync(ct);
        available = new((await history.TreeAsync("HEAD", ct)).Keys, StringComparer.Ordinal);
        if (cloned && await history.HeadAsync(ct) != null) await history.Git(ct, "read-tree", "HEAD");
        ready = true;
    }
    private async Task ValidateDestinations(CancellationToken ct)
    {
        foreach (var args in new[] { new[] { "remote", "get-url", "--all", "origin" }, new[] { "remote", "get-url", "--push", "--all", "origin" } })
        {
            var urls = await history.Runner.RunAsync("git", args, history.HistoryRoot, ct);
            var values = urls.Text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            if (urls.ExitCode != 0 || values.Length != 1 || values[0].Trim() != "https://github.com/" + repository + ".git") throw new InvalidOperationException("Repository fetch or push destination does not match the selected private repository.");
        }
    }
    public async Task SyncAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct); await ValidatePrivate(ct); await ValidateDestinations(ct);
        await history.CheckIndexAsync([], ct);
        var fetch = await history.Git(ct, "fetch", "--filter=blob:none", "origin");
        if (fetch.Error.Contains("filtering not recognized", StringComparison.OrdinalIgnoreCase) || fetch.Error.Contains("does not support", StringComparison.OrdinalIgnoreCase)) throw new NotSupportedException("Server does not support lazy Git object fetching.");
        var remote = await history.Runner.RunAsync("git", ["rev-parse", "--verify", "refs/remotes/origin/main"], history.HistoryRoot, ct);
        var local = await history.HeadAsync(ct);
        var tree = await history.TreeAsync("HEAD", ct);
        if (remote.ExitCode == 0)
        {
            var remoteId = remote.Text.Trim(); var incoming = await history.TreeAsync("origin/main", ct);
            foreach (var item in incoming)
            {
                if (tree.TryGetValue(item.Key, out var existing) && existing != item.Value) throw new InvalidDataException("Immutable remote object collision.");
                tree[item.Key] = item.Value;
            }
            if (local == null)
            {
                await history.Git(ct, "update-ref", "refs/heads/main", remoteId);
                await history.Git(ct, "symbolic-ref", "HEAD", "refs/heads/main");
                await history.Git(ct, "read-tree", "HEAD");
            }
            else if (local != remoteId)
            {
                var ancestor = await history.Runner.RunAsync("git", ["merge-base", "--is-ancestor", remoteId, local], history.HistoryRoot, ct);
                if (ancestor.ExitCode != 0)
                {
                    var forward = await history.Runner.RunAsync("git", ["merge-base", "--is-ancestor", local, remoteId], history.HistoryRoot, ct);
                    if (forward.ExitCode == 0)
                    {
                        await history.Git(ct, "update-ref", "refs/heads/main", remoteId, local);
                        await history.Git(ct, "read-tree", "HEAD");
                    }
                    else await history.PublishTreeAsync(tree, "Merge encrypted snapshots", [local, remoteId], ct);
                }
            }
        }
        if (await history.HeadAsync(ct) == null) return;
        available = new(tree.Keys, StringComparer.Ordinal);
        foreach (var path in tree.Keys.Where(p => p == "vault.json" || p.StartsWith("commits/", StringComparison.Ordinal))) await EnsureFileAsync(path, ct);
        await ValidatePrivate(ct); await ValidateDestinations(ct);
        await PublishBoundedAsync(ct);
    }
    private async Task PublishBoundedAsync(CancellationToken ct)
    {
        var head = (await history.HeadAsync(ct))!;
        var remote = await history.Runner.RunAsync("git", ["rev-parse", "--verify", "refs/remotes/origin/main"], history.HistoryRoot, ct);
        string? published = remote.ExitCode == 0 ? remote.Text.Trim() : null;
        if (published == head) return;
        var args = new List<string> { "rev-list", "--reverse", "--first-parent", head };
        if (published != null) args.Add("^" + published);
        var candidates = (await history.Git(ct, args.ToArray())).Text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
        var plan = new List<string>();
        foreach (var candidate in candidates)
        {
            if (published != null)
            {
                var ancestor = await history.Runner.RunAsync("git", ["merge-base", "--is-ancestor", published, candidate], history.HistoryRoot, ct);
                if (ancestor.ExitCode != 0) continue;
            }
            var objectsArgs = new List<string> { "rev-list", "--objects", candidate };
            if (published != null) objectsArgs.Add("^" + published);
            var objects = (await history.Git(ct, objectsArgs.ToArray())).Text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
            long bytes = 0;
            foreach (var item in objects)
            {
                var id = item.Split(' ')[0];
                var size = (await history.Git(ct, "cat-file", "-s", id)).Text.Trim();
                bytes = checked(bytes + long.Parse(size, System.Globalization.CultureInfo.InvariantCulture));
                if (bytes > history.PublicationBudgetBytes) throw new NotSupportedException("Existing history exceeds the bounded publication budget. Local history is preserved; split new encrypted payload commits before retrying. No oversized publication was attempted.");
            }
            plan.Add(candidate); published = candidate;
        }
        if (plan.Count == 0 || plan[^1] != head) throw new NotSupportedException("History cannot be published in safe bounded fast-forward batches. Local history is preserved.");
        foreach (var candidate in plan)
        {
            await ValidatePrivate(ct); await ValidateDestinations(ct);
            await history.Git(ct, "push", "origin", candidate + ":refs/heads/main");
        }
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
