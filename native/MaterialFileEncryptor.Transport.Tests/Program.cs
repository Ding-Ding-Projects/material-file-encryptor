using MaterialFileEncryptor.Core;
if (args.Length == 2 && args[0] == "--live-private") { await LiveTransportChecks.RunAsync(args[1]); return; }
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
    var initialHistoryCount = (await history.ListSnapshotsAsync()).Count;
    Check(!Directory.Exists(Path.Combine(source, ".git")), "mutable Git state excluded from source");
    Check((await history.ReadEncryptedFileAsync(sha!, part)).SequenceEqual(new byte[] { 0, 255, 32, 10 }), "real binary blob roundtrip");
    File.WriteAllBytes(Path.Combine(source, second), [5, 6]); await history.RecordSnapshotAsync([second]);
    Check((await history.ListSnapshotsAsync()).Count == initialHistoryCount + 1, "real history graph");
    Check((await history.ReadEncryptedFileAsync(sha!, first)).SequenceEqual(new byte[] { 3, 4 }), "old snapshot remains readable");
    Check(await history.RecordSnapshotAsync([second]) == null, "unchanged snapshot produces no commit");
    try { GitVaultHistory.ValidateRelativePath("../plain.txt"); throw new Exception("accepted traversal"); } catch (ArgumentException) { Check(true, "reject traversal and plaintext names"); }
    try { new GitVaultHistory(source, Path.Combine(source, "history")); throw new Exception("accepted overlap"); } catch (ArgumentException) { Check(true, "reject synchronized Git directory"); }
    File.WriteAllBytes(Path.Combine(source, first), [9]);
    try { await history.RecordSnapshotAsync([first]); throw new Exception("accepted mutation"); } catch (InvalidDataException) { Check(true, "reject immutable collision"); }
    var publicRunner = new FakeRunner(false);
    try { await new PrivateGitHubVaultTransport(source, Path.Combine(root, "public"), "owner/repo", publicRunner).InitializeAsync(); throw new Exception("accepted public"); } catch (InvalidOperationException) { Check(publicRunner.Calls == 1, "reject public repository before Git access"); }
    Check((await new VaultProcessRunner().RunAsync("git", ["log", "--format=%s"], history.HistoryRoot)).Text.Split('\n', StringSplitOptions.RemoveEmptyEntries).All(x => x is "Store encrypted snapshot" or "Store encrypted objects"), "generic history messages");
    var runner = new VaultProcessRunner(); var bare = Path.Combine(root, "remote.git");
    async Task Run(string cwd, params string[] arguments) { var r = await runner.RunAsync("git", arguments, cwd); if (r.ExitCode != 0) throw new Exception("Fixture Git operation failed: " + r.Error); }
    await Run(root, "init", "--bare", bare); await Run(bare, "config", "uploadpack.allowFilter", "true");
    await Run(history.HistoryRoot, "remote", "add", "origin", new Uri(bare + Path.DirectorySeparatorChar).AbsoluteUri);
    await Run(history.HistoryRoot, "push", "origin", "main"); await Run(bare, "symbolic-ref", "HEAD", "refs/heads/main");
    File.WriteAllText(Path.Combine(history.HistoryRoot, "plaintext.txt"), "private data");
    await Run(history.HistoryRoot, "add", "plaintext.txt");
    try { await history.RecordSnapshotAsync([second]); throw new Exception("accepted staged plaintext"); } catch (ArgumentException) { Check(true, "reject unrelated staged plaintext"); }
    var staged = await runner.RunAsync("git", ["diff", "--cached", "--name-only"], history.HistoryRoot);
    Check(staged.Text.Contains("plaintext.txt"), "rejected recording preserves staged user data");
    await Run(history.HistoryRoot, "reset", "HEAD", "--", "plaintext.txt");
    var sentinel = Path.Combine(root, "filter-ran").Replace('\\', '/');
    Directory.CreateDirectory(Path.Combine(history.HistoryRoot, ".git", "info"));
    File.WriteAllText(Path.Combine(history.HistoryRoot, ".git", "info", "attributes"), "*.mfe filter=attack\n");
    await Run(history.HistoryRoot, "config", "filter.attack.clean", "echo compromised > '" + sentinel + "'");
    await Run(history.HistoryRoot, "config", "filter.attack.required", "true");
    var filtered = "commits/" + new string('f', 64) + ".mfe"; File.WriteAllBytes(Path.Combine(source, filtered), [42, 0, 255]);
    var filterCommit = await history.RecordSnapshotAsync([filtered]);
    Check(!File.Exists(sentinel), "hostile clean filter never executes");
    Check((await history.ReadEncryptedFileAsync(filterCommit!, filtered)).SequenceEqual(new byte[] { 42, 0, 255 }), "filter bypass preserves exact ciphertext bytes");
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
    var offlineRunner = new OfflineRunner(mapped);
    var offlineTransport = new PrivateGitHubVaultTransport(sourceA, transportA.History.HistoryRoot, "owner/repo", offlineRunner);
    await offlineTransport.InitializeAsync();
    Check(offlineTransport.IsCachedInitialization && offlineRunner.NetworkCalls == 0 && offlineTransport.ContainsFile(part), "verified existing history initializes offline without fetching payloads");
    try { await offlineTransport.SyncAsync(); throw new Exception("offline sync succeeded"); } catch (IOException) { Check(offlineRunner.NetworkCalls == 1, "offline synchronization reports connection failure distinctly"); }
    var pathA = "commits/" + new string('d', 64) + ".mfe"; var pathB = "commits/" + new string('e', 64) + ".mfe";
    File.WriteAllBytes(Path.Combine(sourceA, pathA), [10]); File.WriteAllBytes(Path.Combine(sourceB, pathB), [11]);
    await transportA.History.RecordSnapshotAsync([pathA]); await transportB.History.RecordSnapshotAsync([pathB]);
    await transportA.SyncAsync(); await transportB.SyncAsync(); await transportA.SyncAsync();
    Check(File.Exists(Path.Combine(sourceA, pathB)) && File.Exists(Path.Combine(sourceB, pathA)), "concurrent immutable snapshots reconcile without force push");
    var parents = await runner.RunAsync("git", ["rev-list", "--parents", "-1", "HEAD"], transportB.History.HistoryRoot);
    Check(parents.Text.Trim().Split(' ').Length == 3, "concurrent histories produce a real two-parent merge");
    var convergedA = await runner.RunAsync("git", ["rev-parse", "HEAD"], transportA.History.HistoryRoot);
    var convergedB = await runner.RunAsync("git", ["rev-parse", "HEAD"], transportB.History.HistoryRoot);
    Check(convergedA.Text == convergedB.Text, "behind client fast-forwards without redundant merge");
    Check(transportA.ContainsFile(part) && !transportA.ContainsFile("parts/" + new string('0', 64) + ".mfe"), "availability uses validated tree names without blob reads");
    await Run(transportA.History.HistoryRoot, "config", "remote.origin.pushurl", "https://example.invalid/exfil.git");
    try { await transportA.SyncAsync(); throw new Exception("accepted redirected pushurl"); } catch (InvalidOperationException) { Check(true, "reject redirected pushurl before publication"); }
    await Run(transportA.History.HistoryRoot, "config", "--unset", "remote.origin.pushurl");
    await Run(transportA.History.HistoryRoot, "config", "url.https://example.invalid/.pushInsteadOf", new Uri(bare + Path.DirectorySeparatorChar).AbsoluteUri);
    try { await transportA.SyncAsync(); throw new Exception("accepted rewritten push destination"); } catch (InvalidOperationException) { Check(true, "reject effective pushInsteadOf destination"); }
    await Run(transportA.History.HistoryRoot, "config", "--unset", "url.https://example.invalid/.pushInsteadOf");
    var emptyBare = Path.Combine(root, "empty.git"); await Run(root, "init", "--bare", emptyBare); await Run(emptyBare, "config", "uploadpack.allowFilter", "true");
    var emptyTransport = new PrivateGitHubVaultTransport(Path.Combine(root, "empty-source"), Path.Combine(root, "empty-history"), "owner/repo", new MappedRunner(new Uri(emptyBare + Path.DirectorySeparatorChar).AbsoluteUri));
    await emptyTransport.SyncAsync(); Check((await emptyTransport.History.ListSnapshotsAsync()).Count == 0, "empty private destination synchronizes without unrelated publication");
    File.WriteAllText(Path.Combine(sourceA, "vault.json"), "different");
    try { await transportA.SyncAsync(); throw new Exception("accepted foreign header"); } catch (InvalidDataException) { Check(true, "reject different vault header before publication"); }
    await Run(bare, "config", "uploadpack.allowFilter", "false");
    try { await new PrivateGitHubVaultTransport(Path.Combine(root, "unsupported-source"), Path.Combine(root, "unsupported-history"), "owner/repo", mapped).InitializeAsync(); throw new Exception("accepted unsupported filtering"); } catch (NotSupportedException) { Check(true, "explicitly reject server without lazy-fetch capability"); }
    var batchBare = Path.Combine(root, "batch.git"); await Run(root, "init", "--bare", batchBare); await Run(batchBare, "config", "uploadpack.allowFilter", "true");
    var batchRunner = new MappedRunner(new Uri(batchBare + Path.DirectorySeparatorChar).AbsoluteUri);
    var batchSource = Path.Combine(root, "batch-source"); var batchHistory = Path.Combine(root, "batch-history");
    var batchTransport = new PrivateGitHubVaultTransport(batchSource, batchHistory, "owner/repo", batchRunner, 16384);
    await batchTransport.InitializeAsync(); Directory.CreateDirectory(Path.Combine(batchSource, "parts")); Directory.CreateDirectory(Path.Combine(batchSource, "commits"));
    var batchPaths = new List<string>();
    foreach (var digit in new[] { '1', '2', '3' })
    {
        var path = "parts/" + new string(digit, 64) + ".mfe"; File.WriteAllBytes(Path.Combine(batchSource, path), System.Security.Cryptography.RandomNumberGenerator.GetBytes(6000)); batchPaths.Add(path);
    }
    var batchMetadata = "commits/" + new string('4', 64) + ".mfe"; File.WriteAllBytes(Path.Combine(batchSource, batchMetadata), [1, 2, 3]); batchPaths.Add(batchMetadata);
    await batchTransport.History.RecordSnapshotAsync(batchPaths); await batchTransport.SyncAsync();
    Check(batchRunner.PushCandidates.Count >= 3, "small publication budget produces incremental bounded pushes");
    string? previousBatch = null;
    foreach (var candidate in batchRunner.PushCandidates)
    {
        var objectArgs = new List<string> { "rev-list", "--objects", candidate }; if (previousBatch != null) objectArgs.Add("^" + previousBatch);
        var objects = await runner.RunAsync("git", objectArgs, batchHistory); long objectBytes = 0;
        foreach (var line in objects.Text.Split('\n', StringSplitOptions.RemoveEmptyEntries)) objectBytes += long.Parse((await runner.RunAsync("git", ["cat-file", "-s", line.Split(' ')[0]], batchHistory)).Text.Trim());
        Check(objectBytes <= 16384, "every published batch stays within injectable byte budget"); previousBatch = candidate;
    }
    var firstTree = await runner.RunAsync("git", ["ls-tree", "-r", "--name-only", batchRunner.PushCandidates[0]], batchHistory);
    var finalTree = await runner.RunAsync("git", ["ls-tree", "-r", "--name-only", batchRunner.PushCandidates[^1]], batchHistory);
    Check(firstTree.Text.Contains("parts/") && !firstTree.Text.Contains("commits/") && finalTree.Text.Contains(batchMetadata), "ciphertext objects publish before snapshot metadata");
    var oversized = "parts/" + new string('5', 64) + ".mfe"; File.WriteAllBytes(Path.Combine(batchSource, oversized), new byte[24000]);
    await new GitVaultHistory(batchSource, batchHistory, batchRunner).RecordSnapshotAsync([oversized]);
    var beforeOversized = batchRunner.PushCandidates.Count;
    try { await batchTransport.SyncAsync(); throw new Exception("accepted oversized existing commit"); } catch (NotSupportedException) { Check(batchRunner.PushCandidates.Count == beforeOversized && File.Exists(Path.Combine(batchSource, oversized)), "oversized existing commit fails before push and preserves recovery bytes"); }
    var packagedBase = Path.Combine(root, "packaged", "resources", "native"); Directory.CreateDirectory(packagedBase);
    var packagedGit = Path.Combine(root, "packaged", "resources", "tools", "git", "cmd", "git.exe"); Directory.CreateDirectory(Path.GetDirectoryName(packagedGit)!); File.WriteAllBytes(packagedGit, []);
    var packagedGh = Path.Combine(root, "packaged", "resources", "tools", "gh", "bin", "gh.exe"); Directory.CreateDirectory(Path.GetDirectoryName(packagedGh)!); File.WriteAllBytes(packagedGh, []);
    var packagedRunner = new VaultProcessRunner(baseDirectory: packagedBase);
    Check(packagedRunner.ResolveExecutable("git") == packagedGit && packagedRunner.ResolveExecutable("gh") == packagedGh, "packaged native host resolves sibling bundled tools independently of PATH");
    try { await new VaultProcessRunner(Path.Combine(root, "missing-git.exe")).RunAsync("git", ["--version"], root); throw new Exception("accepted missing tool"); } catch (IOException) { Check(true, "missing configured executable produces explicit tool error"); }
    using var cancellation = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
    var watch = System.Diagnostics.Stopwatch.StartNew();
    try { await runner.RunAsync("git", ["-c", "alias.pause=!sleep 30", "pause"], root, cancellation.Token); throw new Exception("ignored cancellation"); } catch (OperationCanceledException) { Check(watch.Elapsed < TimeSpan.FromSeconds(5), "process cancellation terminates child tree promptly"); }
    Console.WriteLine($"Passed {count} transport checks.");
}
finally
{
    foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)) File.SetAttributes(file, FileAttributes.Normal);
    for (var attempt = 0; ; attempt++)
    {
        try { Directory.Delete(root, true); break; }
        catch (IOException) when (attempt < 2) { await Task.Delay(100); }
    }
}
sealed class FakeRunner(bool isPrivate) : IVaultProcessRunner
{
    public int Calls { get; private set; }
    public Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default) { Calls++; return Task.FromResult(new VaultProcessResult(0, System.Text.Encoding.UTF8.GetBytes("{\"isPrivate\":" + isPrivate.ToString().ToLowerInvariant() + "}"), "")); }
}

sealed class MappedRunner(string uri) : IVaultProcessRunner
{
    private readonly VaultProcessRunner real = new();
    public List<string> PushCandidates { get; } = [];
    private async Task<VaultProcessResult> MappedUrl(IReadOnlyList<string> args, string cwd, CancellationToken ct)
    {
        var result = await real.RunAsync("git", args, cwd, ct);
        return result with { Output = System.Text.Encoding.UTF8.GetBytes(result.Text.Replace(uri, "https://github.com/owner/repo.git")) };
    }
    public Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default)
    {
        if (executable == "git" && arguments.Count > 2 && arguments[0] == "push") PushCandidates.Add(arguments[2].Split(':')[0]);
        if (executable == "gh") return Task.FromResult(new VaultProcessResult(0, System.Text.Encoding.UTF8.GetBytes("{\"isPrivate\":true}"), ""));
        if (arguments.Count > 1 && arguments[0] == "remote" && arguments[1] == "get-url") return MappedUrl(arguments, workingDirectory, cancellationToken);
        return real.RunAsync(executable, arguments.Select(x => x == "https://github.com/owner/repo.git" ? uri : x).ToArray(), workingDirectory, cancellationToken);
    }
}

sealed class OfflineRunner(IVaultProcessRunner local) : IVaultProcessRunner
{
    public int NetworkCalls { get; private set; }
    public Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default)
    {
        if (executable == "gh" || arguments.Any(a => a is "clone" or "fetch" or "push")) { NetworkCalls++; return Task.FromResult(new VaultProcessResult(1, [], "offline")); }
        return local.RunAsync(executable, arguments, workingDirectory, cancellationToken);
    }
}
