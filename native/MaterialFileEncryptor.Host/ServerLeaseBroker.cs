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
    private readonly ServerRuntimeProvisioner runtimes = new();
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string,CancellationTokenSource> runtimeOperations = new();
    private sealed class Entry
    {
        public required string Id, Root, Version, JarHash;
        public int Major;
        public Process? Child;
        public ServerExecutionLease? Lease;
        public long CreationTicks;
        public string State = "prepared";
        public string? RuntimePath;
        public int Port;
        public bool StopDelivered;
        public ServerRuntimeProvisioner.Inventory? RuntimeInventory;
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
        if (entry.Lease?.ReleaseAfterExactExit()==true)
        {
            entry.State = "stopped"; entry.Lease = null;entry.Child = null;
        }
        return new { id = entry.Id, status = entry.State, readiness = "not-verified", process = entry.Child is null ? null : new { pid = entry.Child.Id, creationTime = entry.CreationTicks.ToString() }, network = entry.Port == 0 ? null : new { host = "127.0.0.1", port = entry.Port } };
    }
    public async Task<object?> DispatchAsync(string method, JsonElement value)
    {
        if(method=="runtimeCancel") { Exact(value,"operationId");string operationId=Text(value,"operationId");if(runtimeOperations.TryGetValue(operationId,out var controller)){controller.Cancel();return new { requested=true };}return new { requested=false }; }
        CancellationTokenSource? runtimeController=null;string? runtimeOperationId=null;
        if(method=="runtimePrepare")
        {
            Exact(value,"id","operationId");runtimeOperationId=Text(value,"operationId");if(!Regex.IsMatch(runtimeOperationId,"^[a-f0-9-]{36}$"))throw new ArgumentException();
            runtimeController=new CancellationTokenSource();if(!runtimeOperations.TryAdd(runtimeOperationId,runtimeController)){runtimeController.Dispose();throw new InvalidOperationException("Runtime operation already active.");}
        }
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
                Exact(value); return new { available = false, nativeSupervision = true, runtimeDiscovery = "reviewed-owned-portable", runtimeProvisioning=true, configurationAdmission = "unavailable", reason = "Exact-version generated network configuration proof is not retained. No server can start." };
            }
            if(method=="runtimePrepare")
            {
                Exact(value,"id","operationId");string id=Text(value,"id"),operationId=Text(value,"operationId");
                if(closing||!entries.TryGetValue(id,out var entry)||entry.Child is not null||entry.RuntimeInventory is not null||!Regex.IsMatch(operationId,"^[a-f0-9-]{36}$"))throw new InvalidOperationException("Owned runtime preparation is unavailable.");
                runtimeController!.Token.ThrowIfCancellationRequested();entry.RuntimeInventory=await runtimes.Prepare(root,operationId,entry.Major,runtimeController.Token);return new { verified=true,majorVersion=entry.Major,manifestSha256=entry.RuntimeInventory.ManifestHash,execution="not-run",configurationAdmission="unavailable" };
            }
            if(method=="runtimeStatus")
            {
                var entry=Owned(value);if(entry.RuntimeInventory is null)return new { available=false,reason="No verified owned portable Java runtime is registered." };
                var statusInventory=runtimes.Verify(entry.RuntimeInventory.Root,entry.Major);return new { available=true,majorVersion=entry.Major,manifestSha256=statusInventory.ManifestHash,execution="not-run",configurationAdmission="unavailable" };
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
            var registered=owned.RuntimeInventory??throw new InvalidOperationException("A reviewed compatible owned portable Java runtime is unavailable.");
            var inventory=runtimes.Verify(registered.Root,owned.Major);var runtime=new Runtime(inventory.Root,inventory.Executable,inventory.JavaHash,inventory.Major);
            if (!ConfigurationAdmitted(owned)) throw new InvalidOperationException("Exact-version generated network configuration proof is unavailable.");
            // This path becomes reachable only after a separately reviewed configuration
            // admission implementation is provided, never by a renderer boolean.
            owned.Lease = ServerExecutionLease.Acquire(runtimes,registered.Root,owned.Major,owned.Root,owned.JarHash);
            try
            {
                var start = new ProcessStartInfo(runtime.Executable) { WorkingDirectory = Path.Combine(owned.Root, "server"), UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true };
                foreach (string argument in new[] { "-Xmx512M", "-jar", Path.Combine(owned.Root, "server", "server.jar"), "nogui" }) start.ArgumentList.Add(argument);
                var child = owned.Lease.Start(start);
                owned.Child = child; owned.RuntimePath = runtime.Executable; owned.CreationTicks = owned.Lease.CreationTicks; owned.State = "running";
                _ = Drain(child.StandardOutput); _ = Drain(child.StandardError);
                return View(owned);
            }
            catch { owned.Child=owned.Lease.Child;if(owned.Lease.Released)owned.Lease=null;else if(owned.Child is null){try{owned.Lease.ReleaseBeforeSpawn();owned.Lease=null;}catch{owned.State="ownership-unverified";}}else owned.State="ownership-unverified";throw; }
        }
        finally { admission.Release();if(runtimeOperationId is not null)runtimeOperations.TryRemove(runtimeOperationId,out _);runtimeController?.Dispose(); }
    }
    private static async Task Drain(StreamReader reader) { try { char[] buffer = new char[4096]; while (await reader.ReadAsync(buffer) != 0) Array.Clear(buffer); } catch { } }
    private static async Task Stop(Entry entry)
    {
        View(entry); if (entry.Child is null) return;
        if (entry.State is not ("running" or "stopping" or "stop-timeout") || entry.Child.StartTime.ToUniversalTime().Ticks != entry.CreationTicks || !String.Equals(entry.Child.MainModule?.FileName, entry.RuntimePath, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("Exact owned running process identity is required for stop.");
        entry.Lease?.AssertCanStop(); entry.State = "stopping";
        if (!entry.StopDelivered)
        {
            await entry.Child.StandardInput.WriteLineAsync("stop"); await entry.Child.StandardInput.FlushAsync(); entry.StopDelivered = true;
        }
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        try { await entry.Child.WaitForExitAsync(timeout.Token); View(entry); }
        catch (OperationCanceledException) { entry.State = "stop-timeout"; throw new InvalidOperationException("Owned server graceful stop timed out; native leases are retained and no force termination was attempted."); }
    }
    public async Task CloseAsync()
    {
        if(root is null)return;var result=await DispatchAsync("close",JsonSerializer.SerializeToElement(new { }));
        if(!JsonSerializer.SerializeToElement(result).GetProperty("verified").GetBoolean())throw new InvalidOperationException("Native execution ownership remains retained and shutdown is unverified.");
    }
}
