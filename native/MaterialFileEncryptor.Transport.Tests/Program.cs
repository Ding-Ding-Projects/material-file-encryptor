using MaterialFileEncryptor.Core;
var root = Path.Combine(Path.GetTempPath(), "mfe-transport-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
var count = 0;
void Check(bool condition, string name) { if (!condition) throw new Exception(name); count++; Console.WriteLine("PASS " + name); }
try
{
    var source = Path.Combine(root, "source"); Directory.CreateDirectory(Path.Combine(source, "commits")); Directory.CreateDirectory(Path.Combine(source, "parts"));
    var part = "parts/" + new string('a', 64) + ".mfe"; var first = "commits/" + new string('b', 32) + ".mfe"; var second = "commits/" + new string('c', 64) + ".mfe";
    File.WriteAllBytes(Path.Combine(source, part), [0, 255, 32, 10]); File.WriteAllBytes(Path.Combine(source, first), [3, 4]); File.WriteAllText(Path.Combine(source, "vault.json"), "{}");
    var history = new GitVaultHistory(source, Path.Combine(root, "history"));
    var sha = await history.RecordSnapshotAsync(["vault.json", part, first]);
    Check(sha?.Length == 40, "real Git commit");
    Check(!Directory.Exists(Path.Combine(source, ".git")), "mutable Git state excluded from source");
    Check((await history.ReadEncryptedFileAsync(sha!, part)).SequenceEqual(new byte[] { 0, 255, 32, 10 }), "real binary blob roundtrip");
    File.WriteAllBytes(Path.Combine(source, second), [5, 6]); await history.RecordSnapshotAsync([second]);
    Check((await history.ListSnapshotsAsync()).Count == 2, "real history graph");
    Check((await history.ReadEncryptedFileAsync(sha!, first)).SequenceEqual(new byte[] { 3, 4 }), "old snapshot remains readable");
    Check(await history.RecordSnapshotAsync([second]) == null, "unchanged snapshot produces no commit");
    try { GitVaultHistory.ValidateRelativePath("../plain.txt"); throw new Exception("accepted traversal"); } catch (ArgumentException) { Check(true, "reject traversal and plaintext names"); }
    try { new GitVaultHistory(source, Path.Combine(source, "history")); throw new Exception("accepted overlap"); } catch (ArgumentException) { Check(true, "reject synchronized Git directory"); }
    File.WriteAllBytes(Path.Combine(source, first), [9]);
    try { await history.RecordSnapshotAsync([first]); throw new Exception("accepted mutation"); } catch (InvalidDataException) { Check(true, "reject immutable collision"); }
    var publicRunner = new FakeRunner(false);
    try { await new PrivateGitHubVaultTransport(source, Path.Combine(root, "public"), "owner/repo", publicRunner).InitializeAsync(); throw new Exception("accepted public"); } catch (InvalidOperationException) { Check(publicRunner.Calls == 1, "reject public repository before Git access"); }
    Check((await new VaultProcessRunner().RunAsync("git", ["log", "--format=%s"], history.HistoryRoot)).Text.Split('\n', StringSplitOptions.RemoveEmptyEntries).All(x => x == "Store encrypted snapshot"), "generic history messages");
    var runner = new VaultProcessRunner(); var bare = Path.Combine(root, "remote.git");
    async Task Run(string cwd, params string[] arguments) { var r = await runner.RunAsync("git", arguments, cwd); if (r.ExitCode != 0) throw new Exception("Fixture Git operation failed: " + r.Error); }
    await Run(root, "init", "--bare", bare); await Run(bare, "config", "uploadpack.allowFilter", "true");
    await Run(history.HistoryRoot, "remote", "add", "origin", new Uri(bare + Path.DirectorySeparatorChar).AbsoluteUri);
    await Run(history.HistoryRoot, "push", "origin", "main"); await Run(bare, "symbolic-ref", "HEAD", "refs/heads/main");
    var mapped = new MappedRunner(new Uri(bare + Path.DirectorySeparatorChar).AbsoluteUri);
    var sourceA = Path.Combine(root, "clientA"); var sourceB = Path.Combine(root, "clientB");
    var transportA = new PrivateGitHubVaultTransport(sourceA, Path.Combine(root, "cloneA"), "owner/repo", mapped);
    var transportB = new PrivateGitHubVaultTransport(sourceB, Path.Combine(root, "cloneB"), "owner/repo", mapped);
    await transportA.SyncAsync(); await transportB.SyncAsync();
    Check(File.Exists(Path.Combine(sourceA, first)) && !File.Exists(Path.Combine(sourceA, part)), "partial clone sync materializes metadata only");
    var missing = await runner.RunAsync("git", ["rev-list", "--objects", "--missing=print", "HEAD"], transportA.History.HistoryRoot);
    Check(missing.Text.Split('\n').Any(x => x.StartsWith('?')), "partial clone actually retains missing payload objects");
    await transportA.EnsureFileAsync(part);
    Check(File.ReadAllBytes(Path.Combine(sourceA, part)).SequenceEqual(new byte[] { 0, 255, 32, 10 }), "on-demand blob hydration from real promisor server");
    var pathA = "commits/" + new string('d', 64) + ".mfe"; var pathB = "commits/" + new string('e', 64) + ".mfe";
    File.WriteAllBytes(Path.Combine(sourceA, pathA), [10]); File.WriteAllBytes(Path.Combine(sourceB, pathB), [11]);
    await transportA.History.RecordSnapshotAsync([pathA]); await transportB.History.RecordSnapshotAsync([pathB]);
    await transportA.SyncAsync(); await transportB.SyncAsync(); await transportA.SyncAsync();
    Check(File.Exists(Path.Combine(sourceA, pathB)) && File.Exists(Path.Combine(sourceB, pathA)), "concurrent immutable snapshots reconcile without force push");
    var parents = await runner.RunAsync("git", ["rev-list", "--parents", "-1", "HEAD"], transportB.History.HistoryRoot);
    Check(parents.Text.Trim().Split(' ').Length == 3, "concurrent histories produce a real two-parent merge");
    File.WriteAllText(Path.Combine(sourceA, "vault.json"), "different");
    try { await transportA.SyncAsync(); throw new Exception("accepted foreign header"); } catch (InvalidDataException) { Check(true, "reject different vault header before publication"); }
    await Run(bare, "config", "uploadpack.allowFilter", "false");
    try { await new PrivateGitHubVaultTransport(Path.Combine(root, "unsupported-source"), Path.Combine(root, "unsupported-history"), "owner/repo", mapped).InitializeAsync(); throw new Exception("accepted unsupported filtering"); } catch (NotSupportedException) { Check(true, "explicitly reject server without lazy-fetch capability"); }
    Console.WriteLine($"Passed {count} transport checks.");
}
finally { foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal); Directory.Delete(root, true); }
sealed class FakeRunner(bool isPrivate) : IVaultProcessRunner
{
    public int Calls { get; private set; }
    public Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default) { Calls++; return Task.FromResult(new VaultProcessResult(0, System.Text.Encoding.UTF8.GetBytes("{\"isPrivate\":" + isPrivate.ToString().ToLowerInvariant() + "}"), "")); }
}

sealed class MappedRunner(string uri) : IVaultProcessRunner
{
    private readonly VaultProcessRunner real = new();
    public Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default)
    {
        if (executable == "gh") return Task.FromResult(new VaultProcessResult(0, System.Text.Encoding.UTF8.GetBytes("{\"isPrivate\":true}"), ""));
        if (arguments.SequenceEqual(new[] { "remote", "get-url", "origin" })) return Task.FromResult(new VaultProcessResult(0, System.Text.Encoding.UTF8.GetBytes("https://github.com/owner/repo.git\n"), ""));
        return real.RunAsync(executable, arguments.Select(x => x == "https://github.com/owner/repo.git" ? uri : x).ToArray(), workingDirectory, cancellationToken);
    }
}


