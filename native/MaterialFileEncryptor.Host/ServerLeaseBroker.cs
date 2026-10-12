using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace MaterialFileEncryptor.Host;

// This is a protected stdin capability of the bundled host, never a public API.
// Admission and supervision use the same process that owns the native file leases.
internal sealed class ServerLeaseBroker
{
    private readonly SemaphoreSlim admission = new(1, 1);
    private readonly Dictionary<string, Entry> entries = new(StringComparer.Ordinal);
    private string? root;
    private bool closing;
    private sealed class Entry
    {
        public required string Id, Root, Version, JarHash;
        public int Major;
        public Process? Child;
        public ServerFileLease? Lease;
        public long CreationTicks;
        public string State = "prepared";
        public string? RuntimePath;
        public int Port;
        public bool StopDelivered;
    }
    private sealed record Runtime(string Root, string Executable, string Hash, int Major);
    private static void Exact(JsonElement value, params string[] keys)
    {
        if (value.ValueKind != JsonValueKind.Object || value.EnumerateObject().Count() != keys.Length || value.EnumerateObject().Any(p => !keys.Contains(p.Name, StringComparer.Ordinal))) throw new ArgumentException("Invalid server supervision request.");
    }
    private static string Text(JsonElement value, string key) => value.GetProperty(key).GetString() ?? throw new ArgumentException();
    private static void DirectoryProof(string directory)
    {
        for (string? current = Path.GetFullPath(directory); current is not null; current = Path.GetDirectoryName(current))
        {
            var attributes = File.GetAttributes(current);
            if ((attributes & FileAttributes.Directory) == 0 || (attributes & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("An unlinked local server directory is required.");
        }
    }
    private static string Hash(string file)
    {
        if ((File.GetAttributes(file) & (FileAttributes.Directory | FileAttributes.ReparsePoint)) != 0) throw new InvalidOperationException("An unlinked regular file is required.");
        using var stream = File.OpenRead(file); return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();
    }
    // Only a reviewed, bundled runtime inventory is considered. PATH, JAVA_HOME,
    // renderer paths and arbitrary executables are intentionally not discovery inputs.
    private static Runtime? DiscoverRuntime(int major)
    {
        if (major < 1) return null;
        string directory = Path.Combine(AppContext.BaseDirectory, "server-runtime");
        string manifest = Path.Combine(directory, "manifest.json");
        if (!File.Exists(manifest)) return null;
        DirectoryProof(directory);
        if (new FileInfo(manifest).Length > 16384) throw new InvalidDataException();
        using var document = JsonDocument.Parse(File.ReadAllText(manifest));
        var value = document.RootElement;
        Exact(value, "schemaVersion", "majorVersion", "javaSha256", "releaseSha256", "provenance");
        if (value.GetProperty("schemaVersion").GetInt32() != 1 || value.GetProperty("majorVersion").GetInt32() != major || Text(value, "provenance") != "reviewed-bundled-runtime-v1") return null;
        string executable = Path.Combine(directory, "bin", "java.exe"), release = Path.Combine(directory, "release");
        DirectoryProof(Path.GetDirectoryName(executable)!);
        string digest = Text(value, "javaSha256");
        if (!Regex.IsMatch(digest, "^[a-f0-9]{64}$") || Hash(executable) != digest || Hash(release) != Text(value, "releaseSha256")) throw new InvalidDataException();
        string version = File.ReadAllText(release);
        if (version.Length > 16384 || !Regex.IsMatch(version, "(?m)^JAVA_VERSION=\"" + major + "(?:[.\"+_-])")) throw new InvalidDataException();
        return new Runtime(directory, executable, digest, major);
    }
    // Exact-version network schemas must be retained from an independently
    // inspected distribution. No such proof is currently shipped; fail closed.
    private static bool ConfigurationAdmitted(Entry entry) => false;
    private Entry Owned(JsonElement value)
    {
        Exact(value, "id"); string id = Text(value, "id");
        if (!entries.TryGetValue(id, out var entry)) throw new InvalidOperationException("Server is not owned by this native session.");
        return entry;
    }
    private static object View(Entry entry)
    {
        if (entry.Child is not null && entry.Child.HasExited)
        {
            entry.State = "stopped"; entry.Lease?.Release(); entry.Lease = null;
            entry.Child.Dispose(); entry.Child = null;
        }
        return new { id = entry.Id, status = entry.State, readiness = "not-verified", process = entry.Child is null ? null : new { pid = entry.Child.Id, creationTime = entry.CreationTicks.ToString() }, network = entry.Port == 0 ? null : new { host = "127.0.0.1", port = entry.Port } };
    }
    public async Task<object?> DispatchAsync(string method, JsonElement value)
    {
        await admission.WaitAsync();
        try
        {
            if (method == "initialize")
            {
                Exact(value, "baseRoot"); string proposed = Text(value, "baseRoot");
                if (closing || root is not null || !Path.IsPathFullyQualified(proposed) || proposed.StartsWith("\\\\", StringComparison.Ordinal)) throw new InvalidOperationException("Native server session initialization is unavailable.");
                DirectoryProof(proposed); root = Path.GetFullPath(proposed); return new { initialized = true };
            }
            if (root is null) throw new InvalidOperationException("Initialize the native server session first.");
            if (method == "capabilities")
            {
                Exact(value); return new { available = false, nativeSupervision = true, runtimeDiscovery = "reviewed-bundled-only", configurationAdmission = "unavailable", reason = "Exact-version generated network configuration proof is not retained. No server can start." };
            }
            if (method == "close") { Exact(value); closing = true; foreach (var entry in entries.Values) await Stop(entry); return new { closed = true, verified = entries.Values.All(e => e.Child is null && e.Lease is null) }; }
            if (closing && method != "status" && method != "stop") throw new InvalidOperationException("Native server supervision is closing.");
            if (method == "register")
            {
                Exact(value, "id", "version", "majorVersion", "distributionSha256");
                string id = Text(value, "id"), version = Text(value, "version"), digest = Text(value, "distributionSha256");
                if (!Regex.IsMatch(id, "^server-[a-f0-9-]{36}$") || version.Length is < 1 or > 128 || version.Any(char.IsControl) || !Regex.IsMatch(digest, "^[a-f0-9]{64}$") || entries.Count >= 100 || entries.ContainsKey(id)) throw new ArgumentException();
                string directory = Path.Combine(root, id); DirectoryProof(Path.Combine(directory, "server"));
                if (Hash(Path.Combine(directory, "server", "server.jar")) != digest) throw new InvalidDataException();
                var entry = new Entry { Id = id, Root = directory, Version = version, JarHash = digest, Major = value.GetProperty("majorVersion").GetInt32() };
                entries.Add(id, entry); return View(entry);
            }
            var owned = Owned(value);
            if (method == "status") return View(owned);
            if (method == "stop") { await Stop(owned); return View(owned); }
            if (method != "start") throw new ArgumentException();
            View(owned);
            if (owned.Child is not null || owned.Lease is not null || owned.State != "prepared") throw new InvalidOperationException("Prepared owned server admission is required.");
            DirectoryProof(Path.Combine(owned.Root, "server"));
            if (File.ReadAllText(Path.Combine(owned.Root, "server", "eula.txt")) != "eula=true\n") throw new InvalidOperationException("Exact server license acceptance is required.");
            var runtime = DiscoverRuntime(owned.Major) ?? throw new InvalidOperationException("A reviewed compatible bundled Java runtime is unavailable.");
            if (!ConfigurationAdmitted(owned)) throw new InvalidOperationException("Exact-version generated network configuration proof is unavailable.");
            // This path becomes reachable only after a separately reviewed configuration
            // admission implementation is provided, never by a renderer boolean.
            owned.Lease = ServerFileLease.Acquire(owned.Root, owned.JarHash, runtime.Root, runtime.Executable, runtime.Hash);
            try
            {
                var start = new ProcessStartInfo(runtime.Executable) { WorkingDirectory = Path.Combine(owned.Root, "server"), UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
                foreach (string argument in new[] { "-Xmx512M", "-jar", Path.Combine(owned.Root, "server", "server.jar"), "nogui" }) start.ArgumentList.Add(argument);
                var child = new Process { StartInfo = start };
                if (!child.Start()) throw new InvalidOperationException("Owned server did not start.");
                owned.Child = child; owned.RuntimePath = runtime.Executable; owned.CreationTicks = child.StartTime.ToUniversalTime().Ticks; owned.State = "running";
                _ = Drain(child.StandardOutput); _ = Drain(child.StandardError);
                return View(owned);
            }
            catch { if (owned.Child is null) { owned.Lease.Release(); owned.Lease = null; } else owned.State = "ownership-unverified"; throw; }
        }
        finally { admission.Release(); }
    }
    private static async Task Drain(StreamReader reader) { try { char[] buffer = new char[4096]; while (await reader.ReadAsync(buffer) != 0) Array.Clear(buffer); } catch { } }
    private static async Task Stop(Entry entry)
    {
        View(entry); if (entry.Child is null) return;
        if (entry.State is not ("running" or "stopping" or "stop-timeout") || entry.Child.StartTime.ToUniversalTime().Ticks != entry.CreationTicks || !String.Equals(entry.Child.MainModule?.FileName, entry.RuntimePath, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Exact owned running process identity is required for stop.");
        entry.Lease?.AssertHeld(); entry.State = "stopping";
        if (!entry.StopDelivered)
        {
            await entry.Child.StandardInput.WriteLineAsync("stop"); await entry.Child.StandardInput.FlushAsync(); entry.StopDelivered = true;
        }
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        try { await entry.Child.WaitForExitAsync(timeout.Token); View(entry); }
        catch (OperationCanceledException) { entry.State = "stop-timeout"; throw new InvalidOperationException("Owned server graceful stop timed out; native leases are retained and no force termination was attempted."); }
    }
    public async Task CloseAsync() { if (root is not null) await DispatchAsync("close", JsonSerializer.SerializeToElement(new { })); }
}
