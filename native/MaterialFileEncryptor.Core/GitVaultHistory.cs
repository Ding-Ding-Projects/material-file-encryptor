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
    public async Task<VaultProcessResult> RunAsync(string executable, IReadOnlyList<string> arguments, string workingDirectory, CancellationToken cancellationToken = default)
    {
        var start = new ProcessStartInfo(executable) { WorkingDirectory = workingDirectory, RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true };
        foreach (var argument in arguments) start.ArgumentList.Add(argument);
        start.Environment["GIT_TERMINAL_PROMPT"] = "0";
        start.Environment["GIT_CONFIG_NOSYSTEM"] = "1";
        start.Environment["GIT_AUTHOR_NAME"] = "Vault storage";
        start.Environment["GIT_AUTHOR_EMAIL"] = "vault@localhost";
        start.Environment["GIT_COMMITTER_NAME"] = "Vault storage";
        start.Environment["GIT_COMMITTER_EMAIL"] = "vault@localhost";
        using var process = Process.Start(start) ?? throw new IOException("Unable to start storage tool.");
        using var output = new MemoryStream();
        var copy = process.StandardOutput.BaseStream.CopyToAsync(output, cancellationToken);
        var error = process.StandardError.ReadToEndAsync(cancellationToken);
        try { await Task.WhenAll(copy, process.WaitForExitAsync(cancellationToken)); }
        catch { if (!process.HasExited) process.Kill(true); throw; }
        return new(process.ExitCode, output.ToArray(), await error);
    }
}

/// <summary>Local Git history containing ciphertext only. The mutable repository must be outside both vault folders.</summary>
public sealed class GitVaultHistory
{
    internal readonly string SourceRoot;
    public string HistoryRoot { get; }
    internal readonly IVaultProcessRunner Runner;
    public GitVaultHistory(string sourceRoot, string historyRoot, IVaultProcessRunner? runner = null)
    {
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
        if (!Directory.Exists(Path.Combine(HistoryRoot, ".git"))) await Git(ct, "init", "-b", "main");
        await Git(ct, "config", "core.hooksPath", Path.Combine(HistoryRoot, ".disabled-hooks"));
        await Git(ct, "config", "commit.gpgsign", "false");
    }
    public async Task<string?> RecordSnapshotAsync(IEnumerable<string> encryptedRelativePaths, CancellationToken ct = default)
    {
        await InitializeAsync(ct);
        var paths = encryptedRelativePaths.Select(ValidateRelativePath).Distinct(StringComparer.Ordinal).ToArray();
        foreach (var relative in paths)
        {
            var source = Path.Combine(SourceRoot, relative); var destination = Path.Combine(HistoryRoot, relative);
            CheckPath(source); CheckPath(destination);
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            if (File.Exists(destination))
            {
                using var sourceStream = File.OpenRead(source); using var destinationStream = File.OpenRead(destination);
                if (!System.Security.Cryptography.SHA256.HashData(sourceStream).SequenceEqual(System.Security.Cryptography.SHA256.HashData(destinationStream))) throw new InvalidDataException("Immutable ciphertext collision.");
            }
            else File.Copy(source, destination, true);
        }
        if (paths.Length == 0) return null;
        await Git(ct, new[] { "add", "--sparse", "--" }.Concat(paths).ToArray());
        var changed = await Git(ct, "diff", "--cached", "--name-only");
        if (string.IsNullOrWhiteSpace(changed.Text)) return null;
        await Git(ct, "commit", "-m", "Store encrypted snapshot", "--no-verify");
        return (await Git(ct, "rev-parse", "HEAD")).Text.Trim();
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

