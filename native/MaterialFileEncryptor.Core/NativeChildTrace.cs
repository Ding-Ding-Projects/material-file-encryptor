using System.Diagnostics;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace MaterialFileEncryptor.Core;

public enum NativeChildCategory { SyntheticProbe }
public sealed record NativeHostIdentity(int Pid, string CreationFileTime);
public sealed record NativeChildPoint(string StartedUtc, string EndedUtc, string StartedMonotonic, string EndedMonotonic,
    bool TimesOk, int TimesError, string? CreationFileTime, string? ExitFileTime,
    uint WaitResult, int WaitError, bool ExitCodeOk, int ExitCodeError, uint? ExitCode);
public sealed record NativeChildRecord(int Sequence, NativeChildCategory Category, int HostPid, int ChildPid,
    NativeChildPoint Started, NativeChildPoint Finished);
public sealed record NativeChildTraceReceipt(int Version, NativeHostIdentity Host, long MonotonicFrequency,
    bool Complete, string[] IncompleteReasons, NativeChildRecord[] Children);

/// <summary>Explicit synthetic-test diagnostic. It never authorizes process ownership or stores command payloads.</summary>
public sealed class NativeChildTrace
{
    public const int MaximumChildren = 128, MaximumBytes = 65536;
    private readonly object gate = new();
    private readonly NativeHostIdentity host;
    private readonly long began = Stopwatch.GetTimestamp();
    private readonly List<NativeChildRecord> records = [];
    private readonly HashSet<string> reasons = new(StringComparer.Ordinal);
    private readonly Action<NativeChildRecord>? sink;
    private int sequence, active;
    private bool sealedTrace;

    public NativeChildTrace(NativeHostIdentity expectedHost, Action<NativeChildRecord>? sink = null)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        host = CurrentHost();
        if (host != expectedHost) throw new InvalidOperationException("Diagnostic host identity mismatch.");
        this.sink = sink;
    }

    public static NativeHostIdentity CurrentHost()
    {
        using var process = Process.GetCurrentProcess();
        if (!Native.GetProcessTimes(process.SafeHandle, out var created, out _, out _, out _))
            throw new InvalidOperationException("Diagnostic host identity unavailable.");
        return new(process.Id, created.ToString(CultureInfo.InvariantCulture));
    }

    internal Lease? Begin(Process child)
    {
        lock (gate)
        {
            if (sealedTrace) { reasons.Add("sealed"); return null; }
            if (Stopwatch.GetElapsedTime(began) >= TimeSpan.FromSeconds(60)) { reasons.Add("deadline"); return null; }
            if (sequence >= MaximumChildren) { reasons.Add("child-limit"); return null; }
            if (CurrentHost() != host) { reasons.Add("host-identity"); return null; }
            var number = ++sequence;
            try { var lease = new Lease(this, child, number); active++; return lease; }
            catch { reasons.Add("observation-unavailable"); return null; }
        }
    }

    internal void Lost() { lock (gate) reasons.Add("observation-unavailable"); }

    private NativeChildTraceReceipt Receipt() => new(1, host, Stopwatch.Frequency,
        reasons.Count == 0 && active == 0, reasons.Order(StringComparer.Ordinal).ToArray(), records.ToArray());

    public byte[] Finish()
    {
        lock (gate)
        {
            sealedTrace = true;
            if (active != 0) reasons.Add("active-children");
            if (Stopwatch.GetElapsedTime(began) >= TimeSpan.FromSeconds(60)) reasons.Add("deadline");
            return JsonSerializer.SerializeToUtf8Bytes(Receipt());
        }
    }

    private void Complete(NativeChildRecord record)
    {
        lock (gate)
        {
            if (sealedTrace) { reasons.Add("late-observation"); return; }
            if (Stopwatch.GetElapsedTime(began) >= TimeSpan.FromSeconds(60)) reasons.Add("deadline");
            if (!record.Started.TimesOk || !record.Finished.TimesOk || record.Started.CreationFileTime != record.Finished.CreationFileTime ||
                record.Finished.WaitResult != 0 || !record.Finished.ExitCodeOk) reasons.Add("observation-incomplete");
            records.Add(record);
            if (JsonSerializer.SerializeToUtf8Bytes(Receipt()).Length > MaximumBytes - 1024) { records.RemoveAt(records.Count - 1); reasons.Add("byte-limit"); return; }
            try { sink?.Invoke(record); } catch { reasons.Add("sink-fault"); }
        }
    }

    internal sealed class Lease : IDisposable
    {
        private readonly NativeChildTrace owner;
        private readonly SafeProcessHandle handle;
        private readonly int sequence, pid;
        private readonly NativeChildPoint started;
        private bool retained, disposed;
        internal Lease(NativeChildTrace owner, Process child, int sequence)
        {
            this.owner = owner; this.sequence = sequence; pid = child.Id; handle = child.SafeHandle;
            try { handle.DangerousAddRef(ref retained); started = Observe(handle); }
            catch { if (retained) handle.DangerousRelease(); throw; }
        }
        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            try { owner.Complete(new(sequence, NativeChildCategory.SyntheticProbe, owner.host.Pid, pid, started, Observe(handle))); }
            catch { owner.Lost(); }
            finally { lock (owner.gate) owner.active--; if (retained) { retained = false; handle.DangerousRelease(); } }
        }
    }

    private static NativeChildPoint Observe(SafeProcessHandle handle)
    {
        var utc = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture);
        var monotonic = Stopwatch.GetTimestamp().ToString(CultureInfo.InvariantCulture);
        var times = Native.GetProcessTimes(handle, out var created, out var exited, out _, out _);
        var timesError = times ? 0 : Marshal.GetLastWin32Error();
        var wait = Native.WaitForSingleObject(handle, 0);
        var waitError = wait == uint.MaxValue ? Marshal.GetLastWin32Error() : 0;
        var exitOk = Native.GetExitCodeProcess(handle, out var exit);
        var exitError = exitOk ? 0 : Marshal.GetLastWin32Error();
        return new(utc, DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture), monotonic,
            Stopwatch.GetTimestamp().ToString(CultureInfo.InvariantCulture), times, timesError,
            times ? created.ToString(CultureInfo.InvariantCulture) : null,
            times ? exited.ToString(CultureInfo.InvariantCulture) : null, wait, waitError, exitOk, exitError, exitOk ? exit : null);
    }

    private static class Native
    {
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetProcessTimes(SafeProcessHandle process, out long created, out long exited, out long kernel, out long user);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern uint WaitForSingleObject(SafeProcessHandle process, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetExitCodeProcess(SafeProcessHandle process, out uint exitCode);
    }
}
