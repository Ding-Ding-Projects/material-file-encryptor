using System.Diagnostics;
using System.Text;
using System.Text.RegularExpressions;
namespace MaterialFileEncryptor.Core;

public sealed record VaultProcessResult(int ExitCode, byte[] Output, string Error)
{
    public string Text => Encoding.UTF8.GetString(Output);
}
public interface IVaultProcessRunner
{
    Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default);
}
public sealed class VaultProcessRunner : IVaultProcessRunner
{
    private readonly string? gitExecutable, ghExecutable;
    private readonly string baseDirectory;
    private readonly NativeChildTrace? diagnostic;
    public VaultProcessRunner(string? gitExecutable = null, string? ghExecutable = null, string? baseDirectory = null, NativeChildTrace? diagnostic = null) { this.gitExecutable = gitExecutable; this.ghExecutable = ghExecutable; this.baseDirectory = Path.GetFullPath(baseDirectory ?? AppContext.BaseDirectory); this.diagnostic = diagnostic; }
    public string ResolveExecutable(string name)
    {
        var explicitPath = name == "git" ? gitExecutable : name == "gh" ? ghExecutable : null;
        if (explicitPath != null) return File.Exists(explicitPath) ? Path.GetFullPath(explicitPath) : throw new IOException("Configured storage tool is unavailable.");
        foreach (var toolsRoot in new[] { Path.GetFullPath(Path.Combine(baseDirectory, "..", "tools")), Path.Combine(baseDirectory, "resources", "tools"), Path.Combine(baseDirectory, "tools") })
        {
            var bundled = Path.Combine(toolsRoot, name, name == "git" ? "cmd" : "bin", name + ".exe");
            if (File.Exists(bundled)) return bundled;
        }
        return name;
    }
    public async Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(60));
        var ct = deadline.Token;
        var start = new ProcessStartInfo(ResolveExecutable(executable)) { WorkingDirectory = workingDirectory, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        if (executable == "git")
        {
            foreach (var setting in new[] { "core.fsmonitor=false", "core.hooksPath=/dev/null", "core.attributesFile=" + ("/dev/null"), "credential.helper=", "credential.helper=!'" + ResolveExecutable("gh").Replace("\\", "/").Replace("'", "'\"'\"'") + "' auth git-credential", "commit.gpgsign=false" }) { start.ArgumentList.Add("-c"); start.ArgumentList.Add(setting); }
        }
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        start.Environment["GIT_TERMINAL_PROMPT"] = "0";
        start.Environment["GIT_CONFIG_NOSYSTEM"] = "1";
        start.Environment["GIT_CONFIG_GLOBAL"] = "/dev/null";
        start.Environment["GIT_CONFIG_COUNT"] = "0";
        start.Environment["GIT_ATTR_NOSYSTEM"] = "1";
        foreach (var variable in new[] { "GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CONFIG", "GIT_CONFIG_PARAMETERS", "GIT_EXEC_PATH", "GIT_TEMPLATE_DIR", "GIT_ASKPASS", "SSH_ASKPASS", "GIT_SSH", "GIT_SSH_COMMAND", "GIT_PROXY_COMMAND" }) start.Environment.Remove(variable);
        start.Environment["GIT_AUTHOR_NAME"] = "Vault storage";
        start.Environment["GIT_AUTHOR_EMAIL"] = "vault@localhost";
        start.Environment["GIT_COMMITTER_NAME"] = "Vault storage";
        start.Environment["GIT_COMMITTER_EMAIL"] = "vault@localhost";
        Process process;
        try { process = Process.Start(start) ?? throw new IOException("Unable to start storage tool."); }
        catch (System.ComponentModel.Win32Exception) { throw new IOException("Required storage tool is unavailable. Install the bundled Git and GitHub CLI tools."); }
        using var ownedProcess = process;
        NativeChildTrace.Lease? observation = null;
        try { observation = diagnostic?.Begin(process); } catch { diagnostic?.Lost(); }
        using var ownedObservation = observation;
        // Storage commands receive no input. Inheriting the desktop host's input
        // lets an unexpected prompt wait indefinitely for a user who cannot see it.
        process.StandardInput.Close();
        using var output = new MemoryStream();
        var copy = process.StandardOutput.BaseStream.CopyToAsync(output, ct);
        var error = process.StandardError.ReadToEndAsync(ct);
        var completion = Task.WhenAll(copy, error, process.WaitForExitAsync(ct));
        try { await completion.WaitAsync(ct); }
        catch
        {
            // Cancellation must cover both pipes, including stderr after the
            // parent exits. Preserve the original exception if teardown races exit.
            try
            {
                if (!process.HasExited) process.Kill(true);
                using var stop = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await process.WaitForExitAsync(stop.Token);
                await completion.WaitAsync(stop.Token);
            }
            catch (Exception cleanup) when (cleanup is OperationCanceledException or IOException or InvalidOperationException or System.ComponentModel.Win32Exception) { }
            throw;
        }
        return new(process.ExitCode, output.ToArray(), await error);
    }
}

/// <summary>Local Git history containing ciphertext only. The mutable repository must be outside both vault folders.</summary>
public sealed class GitVaultHistory
{
    internal readonly string SourceRoot;
    public string HistoryRoot { get; }
    internal readonly IVaultProcessRunner Runner;
    public long PublicationBudgetBytes { get; }
    public GitVaultHistory(string sourceRoot, string historyRoot, IVaultProcessRunner? runner = null, long publicationBudgetBytes = 1024L * 1024 * 1024)
    {
        if (publicationBudgetBytes < 8192 || publicationBudgetBytes > 1024L * 1024 * 1024) throw new ArgumentOutOfRangeException(nameof(publicationBudgetBytes));
        PublicationBudgetBytes = publicationBudgetBytes;
        SourceRoot = Path.GetFullPath(sourceRoot); HistoryRoot = Path.GetFullPath(historyRoot);
        if (Contains(SourceRoot, HistoryRoot) || Contains(HistoryRoot, SourceRoot)) throw new ArgumentException("History and storage folders must not overlap.");
        CheckPath(SourceRoot); CheckPath(HistoryRoot); Runner = runner ?? new VaultProcessRunner();
    }
    private static bool Contains(string parent, string child) => child.Equals(parent, StringComparison.OrdinalIgnoreCase) || child.StartsWith(parent.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    internal static void CheckPath(string path)
    {
        for (var directory = new DirectoryInfo(path); directory != null; directory = directory.Parent)
            if (directory.Exists && (directory.Attributes & FileAttributes.ReparsePoint) != 0) throw new IOException("Storage links are not supported.");
        if (File.Exists(path) && (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0) throw new IOException("Storage links are not supported.");
    }
    public static string ValidateRelativePath(string relativePath)
    {
        if (relativePath == "vault.json") return relativePath;
        if (!Regex.IsMatch(relativePath, @"\A(?:parts|commits)/[a-fA-F0-9]{32}(?:[a-fA-F0-9]{32})?\.mfe\z", RegexOptions.CultureInvariant)) throw new ArgumentException("Invalid encrypted storage path.");
        return relativePath;
    }
    internal async Task<VaultProcessResult> Git(CancellationToken ct, params string[] args)
    {
        var result = await Runner.RunAsync("git", args, HistoryRoot, ct);
        if (result.ExitCode != 0) throw new IOException("Git storage operation failed. Check repository access and local storage.");
        return result;
    }
    public async Task InitializeAsync(CancellationToken ct = default)
    {
        Directory.CreateDirectory(HistoryRoot); CheckPath(HistoryRoot);
        CheckPath(Path.Combine(HistoryRoot, ".git"));
        if (File.Exists(Path.Combine(HistoryRoot, ".git"))) throw new IOException("Storage history requires its own Git directory.");
        if (!Directory.Exists(Path.Combine(HistoryRoot, ".git"))) await Git(ct, "init", "-b", "main");
        await Git(ct, "config", "core.hooksPath", "/dev/null");
        await Git(ct, "config", "commit.gpgsign", "false");
    }
    internal async Task<Dictionary<string,string>> TreeAsync(string reference, CancellationToken ct)
    {
        var result = await Runner.RunAsync("git", ["ls-tree", "-r", reference], HistoryRoot, ct);
        if (result.ExitCode != 0) return [];
        var tree = new Dictionary<string,string>(StringComparer.Ordinal);
        foreach (var line in result.Text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            var fields = line.Split('\t', 2); var header = fields[0].Split(' ');
            if (fields.Length != 2 || header.Length != 3 || header[0] != "100644" || header[1] != "blob") throw new InvalidDataException("Unsupported repository tree entry.");
            tree.Add(ValidateRelativePath(fields[1]), header[2]);
        }
        return tree;
    }
    internal async Task<string?> HeadAsync(CancellationToken ct)
    {
        var head = await Runner.RunAsync("git", ["rev-parse", "--verify", "HEAD"], HistoryRoot, ct);
        return head.ExitCode == 0 ? head.Text.Trim() : null;
    }
    internal async Task<string> PublishTreeAsync(Dictionary<string,string> tree, string message, IReadOnlyList<string> parents, CancellationToken ct)
    {
        await Git(ct, "read-tree", "--empty");
        foreach (var item in tree) await Git(ct, "update-index", "--add", "--cacheinfo", "100644," + item.Value + "," + ValidateRelativePath(item.Key));
        var treeId = (await Git(ct, "write-tree")).Text.Trim();
        var args = new List<string> { "commit-tree", treeId, "-m", message };
        foreach (var parent in parents) { args.Add("-p"); args.Add(parent); }
        var commit = (await Git(ct, args.ToArray())).Text.Trim();
        await Git(ct, "update-ref", "refs/heads/main", commit);
        await Git(ct, "symbolic-ref", "HEAD", "refs/heads/main");
        return commit;
    }
    internal async Task CheckIndexAsync(IReadOnlyCollection<string> allowed, CancellationToken ct)
    {
        var staged = await Git(ct, "diff", "--cached", "--name-only");
        foreach (var path in staged.Text.Split('\n', StringSplitOptions.RemoveEmptyEntries))
            if (!allowed.Contains(ValidateRelativePath(path))) throw new InvalidDataException("Unrelated staged data must be preserved separately before recording.");
    }
    public async Task<string?> RecordSnapshotAsync(IEnumerable<string> encryptedRelativePaths, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var paths = encryptedRelativePaths.Select(ValidateRelativePath).Distinct(StringComparer.Ordinal).ToArray();
        await CheckIndexAsync(paths, ct);
        var parent = await HeadAsync(ct); var originalParent = parent; var tree = await TreeAsync("HEAD", ct); var changed = false;
        long batchBytes = 4096; var partsBatch = true;
        foreach (var relative in paths.OrderBy(p => p.StartsWith("parts/", StringComparison.Ordinal) ? 0 : 1))
        {
            var source = Path.Combine(SourceRoot, relative); CheckPath(source);
            var length = new FileInfo(source).Length;
            if (length + 4096 > PublicationBudgetBytes) throw new NotSupportedException("Encrypted object exceeds the bounded publication budget. Preserve local history and use smaller encrypted parts.");
            if (changed && (batchBytes + length + 160 > PublicationBudgetBytes || (partsBatch && !relative.StartsWith("parts/", StringComparison.Ordinal))))
            {
                parent = await PublishTreeAsync(tree, "Store encrypted objects", parent == null ? [] : [parent], ct);
                changed = false; batchBytes = 4096;
            }
            partsBatch = relative.StartsWith("parts/", StringComparison.Ordinal);
            var blob = (await Git(ct, "hash-object", "-w", "--no-filters", "--", source)).Text.Trim();
            if (tree.TryGetValue(relative, out var old)) { if (old != blob) throw new InvalidDataException("Immutable ciphertext collision."); }
            else { tree.Add(relative, blob); changed = true; batchBytes += length + 160; }
        }
        return changed ? await PublishTreeAsync(tree, "Store encrypted snapshot", parent == null ? [] : [parent], ct) : parent != originalParent ? parent : null;
    }
    public async Task<IReadOnlyList<string>> ListSnapshotsAsync(CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var head = await Runner.RunAsync("git", ["rev-parse", "--verify", "HEAD"], HistoryRoot, ct);
        if (head.ExitCode != 0) return [];
        return (await Git(ct, "log", "--format=%H")).Text.Split('\n', StringSplitOptions.RemoveEmptyEntries);
    }
    public async Task<byte[]> ReadEncryptedFileAsync(string snapshot, string relativePath, CancellationToken ct = default)
    {
        if (!Regex.IsMatch(snapshot, @"\A[a-fA-F0-9]{40}(?:[a-fA-F0-9]{24})?\z")) throw new ArgumentException("Invalid history identifier.");
        return (await Git(ct, "show", snapshot + ":" + ValidateRelativePath(relativePath))).Output;
    }
}
