#nullable enable
using System.ComponentModel;
using System.Diagnostics;

namespace MaterialFileEncryptor.Host;

// This owner never releases runtime members merely because a launch request
// returned an error. The exact spawned Process and its handles stay retained.
internal sealed class ServerExecutionLease
{
    private readonly ServerFileLease runtimeLease, distributionLease;
    private readonly string executable;
    private bool attempted;
    public bool Released { get; private set; }
    public Process? Child { get; private set; }
    public long CreationTicks { get; private set; }
    public int ProcessId { get; private set; }
    public bool IdentityVerified { get; private set; }
    private ServerExecutionLease(ServerFileLease runtimeLease,ServerFileLease distributionLease,string executable)
    { this.runtimeLease=runtimeLease;this.distributionLease=distributionLease;this.executable=Path.GetFullPath(executable); }

    internal static ServerExecutionLease Acquire(ServerRuntimeProvisioner provider,string runtimeRoot,int major,string serverRoot,string jarHash)
    {
        var retained=provider.VerifyAndRetain(runtimeRoot,major);
        try
        {
            var inventory=retained.Inventory;
            var distribution=ServerFileLease.Acquire(serverRoot,jarHash,inventory.Root,inventory.Executable,inventory.JavaHash);
            return new ServerExecutionLease(retained.Lease,distribution,inventory.Executable);
        }
        catch { retained.Lease.Release();throw; }
    }
    // The independent verifier supplies only fresh synthetic owned files. This
    // internal factory is not exposed through native IPC or production admission.
#if SERVER_LEASE_VERIFIER
    internal static ServerExecutionLease AcquireSynthetic(string root,IReadOnlyDictionary<string,string> members,string serverRoot,string jarHash,string runtimeExecutable,string runtimeHash,string childExecutable)
    {
        var runtime=ServerFileLease.AcquireRuntimeInventory(root,members);
        try { return new ServerExecutionLease(runtime,ServerFileLease.Acquire(serverRoot,jarHash,root,runtimeExecutable,runtimeHash),childExecutable); }
        catch { runtime.Release();throw; }
    }
#endif
#if SERVER_LEASE_VERIFIER
    internal void DropRuntimeProtectionForNegativeControl() { runtimeLease.Release(); }
#endif
    public void AssertHeld()
    { if(Released)throw new InvalidOperationException("Execution lease is released.");runtimeLease.AssertHeld();distributionLease.AssertHeld(); }
    public void ReleaseBeforeSpawn()
    {
        if(attempted||Child is not null)throw new InvalidOperationException("A launch attempt requires exact outcome evidence before release.");
        ReleaseHeld();
    }
    private void ReleaseHeld()
    { if(Released)return;distributionLease.Release();runtimeLease.Release();Released=true; }
    public Process Start(ProcessStartInfo start,Func<Process,long>? readCreation=null)
    {
        AssertHeld();if(attempted||Child is not null||!String.Equals(Path.GetFullPath(start.FileName),executable,StringComparison.OrdinalIgnoreCase)||start.UseShellExecute)throw new InvalidOperationException("Exact protected executable and one launch attempt are required.");
        attempted=true;
        try
        {
            // Production returns only after CreateProcess succeeds. Keep its
            // retained process handle before any identity inspection can fail.
            Child=Process.Start(start);
            if(Child is null){ReleaseHeld();throw new InvalidOperationException("No child process was created.");}
        }
        catch(Win32Exception){ReleaseHeld();throw;}
        try
        {
            var spawned=Child??throw new InvalidOperationException("Spawn outcome is unavailable.");
            _=spawned.SafeHandle;ProcessId=spawned.Id;CreationTicks=readCreation is null?spawned.StartTime.ToUniversalTime().Ticks:readCreation(spawned);
            if(spawned.HasExited||!String.Equals(spawned.MainModule?.FileName,executable,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Exact child identity could not be verified.");
            IdentityVerified=true;return spawned;
        }
        catch { IdentityVerified=false;throw; }
    }
    public bool ReleaseAfterExactExit()
    {
        if(Child is null)return false;
        // This Process comes directly from the protected start, never from an
        // adopted PID. Its retained handle distinguishes exit from PID reuse.
        if(Child.SafeHandle.IsClosed||Child.SafeHandle.IsInvalid||!Child.HasExited)return false;
        if(ProcessId!=0&&Child.Id!=ProcessId)throw new InvalidOperationException("Retained child identity differs.");
        ReleaseHeld();Child.Dispose();Child=null;return true;
    }
    public void AssertCanStop()
    {
        AssertHeld();if(!IdentityVerified||Child is null||Child.HasExited||Child.Id!=ProcessId||Child.StartTime.ToUniversalTime().Ticks!=CreationTicks||!String.Equals(Child.MainModule?.FileName,executable,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Exact owned live child identity is required.");
    }
}
