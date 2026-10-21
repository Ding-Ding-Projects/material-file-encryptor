using System.Text.Json;

namespace MaterialFileEncryptor.Host;

// A controller, key, command queue and filesystem belong to exactly one session.
// Reservations precede asynchronous admission and survive ambiguous failures.
internal sealed partial class VaultSessionBroker : IDisposable
{
    private sealed class Session(string id)
    {
        public readonly string Id = id;
        public readonly VaultController Controller = new();
        public readonly HashSet<string> Roots = new(StringComparer.OrdinalIgnoreCase);
        public readonly HashSet<string> Letters = new(StringComparer.OrdinalIgnoreCase);
        public readonly HashSet<string> Repositories = new(StringComparer.OrdinalIgnoreCase);
        public string DriveLetter = "M:";
        public int Pending;
        public bool Transition, Preparing;
        public string? SnapshotId;
        public MaterialFileEncryptor.Core.VaultEngine.EncryptedSnapshot? StagedSnapshot;
    }
    private readonly object gate = new();
    private readonly Dictionary<string, Session> sessions = new(StringComparer.Ordinal);
    private bool closing;

    public VaultSessionBroker()
    {
        var main = new Session("main");
        main.Controller.Status();
        sessions.Add(main.Id, main);
    }
    private static string? String(JsonElement args, string key) => args.ValueKind == JsonValueKind.Object && args.TryGetProperty(key, out var value) && value.ValueKind != JsonValueKind.Null ? value.GetString() : null;
    public static string SessionId(JsonElement args)
    {
        if (args.ValueKind == JsonValueKind.Undefined) return "main";
        if (args.ValueKind != JsonValueKind.Object) throw new ArgumentException("Request parameters must be an object.");
        if (!args.TryGetProperty("sessionId", out var value)) return "main";
        if (value.ValueKind != JsonValueKind.String) throw new ArgumentException("Select a valid vault session.");
        string id = value.GetString()!;
        if (id != "main" && (id.Length != 32 || id.Any(character => !Uri.IsHexDigit(character)))) throw new ArgumentException("Select a valid vault session.");
        return id;
    }
    private Session Find(string id) => sessions.TryGetValue(id, out var session) ? session : throw new InvalidOperationException("The selected vault session no longer exists.");
    private void Reconcile(Session session)
    {
        if (session.Pending == 0 && session.SnapshotId is null && session.Controller.IsSessionReleased())
        { session.Roots.Clear(); session.Letters.Clear(); session.Repositories.Clear(); }
    }
    public Task<object?> DispatchAsync(string method, JsonElement args)
    {
        lock (gate)
        {
            if (closing) throw new InvalidOperationException("Vault sessions are shutting down.");
            string sessionId = SessionId(args);
            foreach (var existing in sessions.Values) Reconcile(existing);
            if (method == "listSessions") return Task.FromResult<object?>(sessions.Values.Select(Info).ToArray());
            if (method == "createSession")
            {
                if (sessions.Count >= 24) throw new InvalidOperationException("Close an unused vault session before adding another.");
                var added = new Session(Guid.NewGuid().ToString("N"));
                added.Controller.Status(); sessions.Add(added.Id, added);
                return Task.FromResult<object?>(Info(added));
            }
            var session = Find(sessionId);
            if (method == "beginSnapshot") return BeginSnapshot(session);
            if (method == "releaseSnapshot") return Task.FromResult<object?>(ReleaseSnapshot(session, args));
            if ((session.Preparing || session.SnapshotId is not null && session.StagedSnapshot is null) && method is not ("status" or "statusSummary" or "operations"))
                throw new InvalidOperationException("An encrypted image snapshot is being prepared. Wait for it to finish.");
            if (method == "removeSession")
            {
                if (session.Id == "main") throw new InvalidOperationException("The default vault session cannot be removed.");
                if (session.Pending != 0 || session.SnapshotId is not null || !session.Controller.IsSessionReleased()) throw new InvalidOperationException("Lock the vault and wait for its work to finish before removing this session.");
                session.Controller.Dispose(); sessions.Remove(session.Id);
                return Task.FromResult<object?>(new { sessionId = session.Id, removed = true });
            }
            bool transition = method is "create" or "unlock" or "autoUnlock" or "mount" or "copyUpgrade" or "lock" or "unmount";
            if (transition && session.Transition) throw new InvalidOperationException("A vault transition is already in progress for this session.");
            if (method == "forceLock" && session.Preparing) throw new InvalidOperationException("Vault folders are being checked. Retry locking when that check finishes.");
            if (method is "create" or "unlock" or "autoUnlock" or "copyUpgrade" or "mount")
            {
                if (method != "mount")
                    foreach (string name in new[] { "storageDir", "cacheDir" })
                        RejectMountedRoot(Path.GetFullPath(String(args, name) ?? throw new ArgumentException("Select vault folders.")));
                ++session.Pending; session.Transition = true; session.Preparing = true;
                return PrepareAsync(session, method, args);
            }
            ++session.Pending;
            if (transition) session.Transition = true;
            Task<object?> request;
            try { request = session.Controller.DispatchAsync(method, args); }
            catch
            {
                --session.Pending; if (transition) session.Transition = false; Reconcile(session); throw;
            }
            return CompleteAsync(session, request, transition, null);
        }
    }
    private void RejectMountedRoot(string root)
    {
        if (!OperatingSystem.IsWindows()) return;
        string? drive = Path.GetPathRoot(root)?.TrimEnd('\\');
        if (drive is not null && sessions.Values.Any(session => session.Letters.Contains(drive)))
            throw new ArgumentException("Vault storage and cache cannot be inside a session's encrypted drive.");
    }
    private async Task<object?> PrepareAsync(Session session, string method, JsonElement args)
    {
        string? selectedDrive = null;
        Task<object?> request;
        try
        {
            // Folder identity may require filesystem access. It must not stall
            // stdin, status replies or an unrelated session's control requests.
            string[] roots = await Task.Run(() => method == "mount" ? Array.Empty<string>() : new[] {
                VaultSessionPaths.Canonical(String(args, "storageDir") ?? throw new ArgumentException("Select encrypted storage.")),
                VaultSessionPaths.Canonical(String(args, "cacheDir") ?? throw new ArgumentException("Select an encrypted cache.")) }).ConfigureAwait(false);
            if (roots.Length == 2 && VaultSessionPaths.Overlap(roots[0], roots[1])) throw new ArgumentException("Storage and cache folders must be separate.");
            string? repository = null;
            if (String(args, "transport") == "privateGit")
            {
                repository = String(args, "remoteRepository") ?? throw new ArgumentException("Choose a private repository.");
                if (!System.Text.RegularExpressions.Regex.IsMatch(repository, @"\A[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*\z")) throw new ArgumentException("Use an owner/repository identifier.");
                if (repository.EndsWith(".git", StringComparison.OrdinalIgnoreCase)) repository = repository[..^4];
            }
            lock (gate)
            {
                if (closing) throw new InvalidOperationException("Vault sessions are shutting down.");
                foreach (string root in roots) RejectMountedRoot(root);
                selectedDrive = (String(args, "driveLetter") ?? session.DriveLetter).Trim().TrimEnd('\\').ToUpperInvariant();
                if (selectedDrive.Length != 2 || selectedDrive[0] is < 'D' or > 'Z' || selectedDrive[1] != ':') throw new ArgumentException("Choose a drive letter between D: and Z:.");
                foreach (var other in sessions.Values.Where(other => other != session))
                {
                    Reconcile(other);
                    if (repository is not null && other.Repositories.Contains(repository)) throw new InvalidOperationException("Another vault session owns that private repository.");
                    if (other.Letters.Contains(selectedDrive)) throw new InvalidOperationException("That drive letter is reserved by another vault session.");
                    if (roots.Any(root => other.Roots.Any(owned => VaultSessionPaths.Overlap(root, owned)))) throw new InvalidOperationException("Another vault session owns that storage or cache folder.");
                }
                foreach (string root in roots) session.Roots.Add(root);
                session.Letters.Add(selectedDrive);
                if (repository is not null) session.Repositories.Add(repository);
                request = session.Controller.DispatchAsync(method, args);
                session.Preparing = false;
            }
        }
        catch
        {
            lock (gate) { --session.Pending; session.Transition = false; session.Preparing = false; Reconcile(session); }
            throw;
        }
        return await CompleteAsync(session, request, true, selectedDrive).ConfigureAwait(false);
    }
    private async Task<object?> CompleteAsync(Session session, Task<object?> request, bool transition, string? selectedDrive)
    {
        bool succeeded = false;
        try { var result = await request.ConfigureAwait(false); succeeded = true; return result; }
        finally
        {
            lock (gate)
            {
                if (succeeded && selectedDrive is not null) session.DriveLetter = selectedDrive;
                --session.Pending; if (transition) session.Transition = false; Reconcile(session);
            }
        }
    }
    private static object Info(Session session) => new { sessionId = session.Id, status = session.Controller.StatusSummary() };
    public (string SessionId, object Status)[] Summaries()
    {
        lock (gate) return sessions.Values.Select(s => (s.Id, s.Controller.StatusSummary())).ToArray();
    }
    public void Tick()
    {
        Session[] snapshot; lock (gate) snapshot = sessions.Values.ToArray();
        foreach (var session in snapshot)
        {
            try { session.Controller.TickIfUnlocked(); session.Controller.Status(); } catch { }
        }
        lock (gate) foreach (var session in sessions.Values) Reconcile(session);
    }
    public object MainStatus() { lock (gate) return Find("main").Controller.Status(); }
    public async Task ForceLockAllAsync()
    {
        Session[] snapshot; lock (gate) { closing = true; snapshot = sessions.Values.ToArray(); }
        await Task.WhenAll(snapshot.Select(async session =>
        {
            try { await session.Controller.DispatchAsync("forceLock", JsonSerializer.SerializeToElement(new { timeoutMs = 10000 })); } catch { }
        }));
    }
    public void Dispose()
    {
        Session[] snapshot; lock (gate) { closing = true; snapshot = sessions.Values.ToArray(); }
        bool busy = false;
        Exception? failure = null;
        foreach (var session in snapshot)
        {
            try { session.StagedSnapshot?.Dispose(); session.StagedSnapshot=null;session.SnapshotId=null; }
            catch(Exception error) { busy=true;failure??=error; }
            try { session.Controller.Dispose(); }
            catch (Exception error) { busy = true; failure ??= error; }
            lock (gate) if (session.Pending != 0 || !session.Controller.IsSessionReleased()) busy = true;
        }
        if (busy) throw new InvalidOperationException("Vault sessions are still releasing their mounts or background work.", failure);
        lock (gate) foreach (var session in sessions.Values) Reconcile(session);
    }
}
