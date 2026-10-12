using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Microsoft.Win32.SafeHandles;

namespace MaterialFileEncryptor.Host;

internal sealed class OllamaRuntimeBroker
{
    private readonly string dataRoot;
    private readonly bool startupAdmitted;
    private readonly SemaphoreSlim serial=new(1,1);
    private readonly Dictionary<string,OllamaContainedProcess> operations=new(StringComparer.Ordinal);
    private string? latest;
    private bool closing;
#if OLLAMA_LIFETIME_VERIFIER
    private Func<OllamaRuntimeLease>? syntheticLease;
    private string? syntheticExecutable,syntheticArguments;
    internal static OllamaRuntimeBroker ForSynthetic(string dataRoot,Func<OllamaRuntimeLease> acquire,string executable,string arguments)
        =>new(dataRoot,true){syntheticLease=acquire,syntheticExecutable=executable,syntheticArguments=arguments};
    internal async Task<bool> VerifySyntheticDescendantAsync(string operationId,uint parentId,uint descendantId,long creationTicks)
    {
        await serial.WaitAsync();try{return operations.TryGetValue(operationId,out var owner)&&owner.ProcessId==parentId&&owner.OriginalExitCodeForSynthetic() is not null&&owner.VerifyRecordedDescendantForSynthetic(descendantId,creationTicks);}finally{serial.Release();}
    }
#endif
    internal OllamaRuntimeBroker(string dataRoot,bool startupAdmitted=false)
    {
        if(!Path.IsPathFullyQualified(dataRoot)||dataRoot.Length>2048)throw new ArgumentException("An absolute application data directory is required.");
        this.dataRoot=Path.GetFullPath(dataRoot);
        this.startupAdmitted=startupAdmitted;
    }
    internal async Task<object> DispatchAsync(string method,JsonElement parameters)
    {
        await serial.WaitAsync();
        try
        {
            if(parameters.ValueKind!=JsonValueKind.Object)throw new ArgumentException("A managed operation object is required.");
            if(method=="managedOllama.start")
            {
                if(parameters.EnumerateObject().Count()!=1||!parameters.TryGetProperty("port",out var port)||!port.TryGetInt32(out var number)||number<1024||number>65535)throw new ArgumentException("A bounded local port is required.");
                if(!startupAdmitted)return Summary(null,null,"unavailable");
                if(closing)throw new InvalidOperationException("Managed runtime shutdown is in progress.");
                foreach(var existing in operations.Values)
                    if(!existing.ReleaseAfterTreeExit())throw new InvalidOperationException("An owned managed runtime is still active or its exit is unknown.");
                if(operations.Count>=64)
                {
                    foreach(string key in operations.Where(value=>value.Value.Released).Select(value=>value.Key).ToArray())operations.Remove(key);
                    if(latest is not null&&!operations.ContainsKey(latest))latest=null;
                }
                if(operations.Count>=64)throw new InvalidOperationException("Managed operation retention exceeds its bound.");
                OllamaRuntimeLease lease;
#if OLLAMA_LIFETIME_VERIFIER
                lease=syntheticLease is not null?syntheticLease():OllamaRuntimeLease.Acquire(dataRoot);
#else
                lease=OllamaRuntimeLease.Acquire(dataRoot);
#endif
                var owner=new OllamaContainedProcess(lease);string operationId=Guid.NewGuid().ToString("N");
                operations.Add(operationId,owner);latest=operationId;
                try
                {
#if OLLAMA_LIFETIME_VERIFIER
                    if(syntheticLease is not null)owner.StartSyntheticOwned(syntheticExecutable!,syntheticArguments!);
                    else
#endif
                    {
                        var environment=PrepareEnvironment(number,out var writableScope);
                        owner.HoldWritableDirectories(writableScope);
                        owner.StartManaged(environment);
                    }
                    return Summary(operationId,owner,"running");
                }
                catch
                {
                    // A failed post-spawn inspection still has an opaque owner.
                    // Attempt exact settlement; unknown outcomes retain ownership.
                    try { if(!owner.ReleaseBeforeSpawnIfKnown()){owner.Stop();await Settle(owner);} } catch { }
                    return Summary(operationId,owner,owner.Released?"stopped":"unknown");
                }
            }
            if(method is not ("managedOllama.status" or "managedOllama.stop" or "managedOllama.close"))throw new ArgumentException("Unknown managed runtime operation.");
            if(parameters.EnumerateObject().Any(value=>value.Name!="operationId")||parameters.EnumerateObject().Count()>1)throw new ArgumentException("Only an opaque operation identity is accepted.");
            string? requested=null;
            if(parameters.TryGetProperty("operationId",out var id))
            {
                if(id.ValueKind!=JsonValueKind.String||!Guid.TryParseExact(id.GetString(),"N",out var parsed)||id.GetString()!=parsed.ToString("N"))throw new ArgumentException("A valid managed operation identity is required.");
                requested=id.GetString();
                if(!operations.ContainsKey(requested!))throw new ArgumentException("Managed operation identity is not registered.");
            }
            if(method!="managedOllama.status"&&requested is null)throw new ArgumentException("An opaque operation identity is required.");
            requested??=latest;
            if(requested is null)return Summary(null,null,startupAdmitted?"idle":"unavailable");
            if(!operations.TryGetValue(requested,out var selected))return Summary(null,null,startupAdmitted&&!closing?"idle":"unavailable");
            try
            {
                if(method!="managedOllama.status"){selected.Stop();await Settle(selected);}
                else selected.ReleaseAfterTreeExit();
                return Summary(requested,selected,selected.Released?"stopped":method=="managedOllama.status"?"running":"stopping");
            }
            catch { return Summary(requested,selected,"unknown"); }
        }
        finally { serial.Release(); }
    }
    private object Summary(string? id,OllamaContainedProcess? owner,string phase)
    {
        uint? active=null;try{if(owner is not null)active=owner.ActiveProcesses();}catch{phase="unknown";}
        return new {available=startupAdmitted,startAvailable=startupAdmitted&&!closing&&operations.Values.All(value=>value.Released),operationId=id,phase,processId=owner is null||owner.ProcessId==0?(uint?)null:owner.ProcessId,activeProcesses=active,exitVerified=owner is not null&&owner.ProcessId!=0&&owner.Released,leaseReleased=owner?.Released??false,limitations=new[]{"File sharing does not establish absolute exclusion against same-user directory insertion or mapped writers.","Orderly exact-job settlement does not verify abrupt host-death handle-release ordering."}};
    }
    private Dictionary<string,string> PrepareEnvironment(int port,out ServerFileLease retainedScope)
    {
        var paths=new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase);
        var scope=ServerFileLease.AcquireDirectoryScope(dataRoot);
        try
        {
            string local=Path.Combine(dataRoot,"local-models");Directory.CreateDirectory(local);scope.HoldDirectory(local);
            foreach(string name in new[]{"runtime-models","runtime-home","runtime-temp","runtime-cache","runtime-appdata"})
            {string path=Path.Combine(local,name);Directory.CreateDirectory(path);scope.HoldDirectory(path);paths.Add(name,path);}
        }
        catch { scope.Release();throw; }
        string windows=Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        if(!Path.IsPathFullyQualified(windows)){scope.Release();throw new InvalidOperationException("The operating-system directory is unavailable.");}
        retainedScope=scope;
        return new Dictionary<string,string>(StringComparer.OrdinalIgnoreCase){["SystemRoot"]=windows,["WINDIR"]=windows,["PATH"]=Path.Combine(windows,"System32"),["HOME"]=paths["runtime-home"],["USERPROFILE"]=paths["runtime-home"],["TEMP"]=paths["runtime-temp"],["TMP"]=paths["runtime-temp"],["LOCALAPPDATA"]=paths["runtime-cache"],["APPDATA"]=paths["runtime-appdata"],["OLLAMA_MODELS"]=paths["runtime-models"],["OLLAMA_HOST"]="127.0.0.1:"+port.ToString(System.Globalization.CultureInfo.InvariantCulture),["OLLAMA_NO_CLOUD"]="1"};
    }
    private static async Task<bool> Settle(OllamaContainedProcess owner)
    {
        DateTime deadline=DateTime.UtcNow.AddSeconds(10);
        while(!owner.ReleaseAfterTreeExit()){if(DateTime.UtcNow>=deadline)return false;await Task.Delay(25);}
        return true;
    }
    internal async Task<bool> CloseAllAsync()
    {
        await serial.WaitAsync();try
        {
            closing=true;bool settled=true;
            foreach(var owner in operations.Values)try{owner.Stop();if(!await Settle(owner))settled=false;}catch{settled=false;}
            return settled;
        }
        finally{serial.Release();}
    }
}

// A suspended child enters a private non-breakaway job before any user code runs.
// Runtime handles release only after querying this exact retained job proves zero
// active members. Unknown query results retain both the job and runtime lease.
internal sealed class OllamaContainedProcess
{
    private readonly OllamaRuntimeLease lease;
    private SafeFileHandle? job,process;
    private bool contained;
    private bool createAttempted;
    private ServerFileLease? writableDirectories;
    internal uint ProcessId { get; private set; }
    internal ulong CreationFileTime { get; private set; }
    internal bool Released { get; private set; }
    internal OllamaContainedProcess(OllamaRuntimeLease lease) { this.lease=lease; }
    internal void HoldWritableDirectories(ServerFileLease scope) { if(createAttempted||writableDirectories is not null)throw new InvalidOperationException("Writable directory scope is already assigned.");writableDirectories=scope; }
    internal bool ReleaseBeforeSpawnIfKnown()
    {
        if(Released)return true;if(createAttempted)return false;
        job?.Dispose();job=null;lease.Release();writableDirectories?.Release();writableDirectories=null;Released=true;return true;
    }
    internal void StartManaged(IReadOnlyDictionary<string,string> environment)=>Start(lease.Executable,"serve",lease.Root,environment);
#if OLLAMA_LIFETIME_VERIFIER
    internal static void StartSynthetic(OllamaRuntimeLease lease,string executable,string arguments,out OllamaContainedProcess owner)
    {
        lease.AssertHeld();owner=new OllamaContainedProcess(lease);
        owner.Start(executable,arguments,Path.GetDirectoryName(executable)!,null);
    }
    internal void StartSyntheticOwned(string executable,string arguments)=>Start(executable,arguments,Path.GetDirectoryName(executable)!,null);
    internal uint? OriginalExitCodeForSynthetic()
    {
        if(process is null||process.IsClosed||process.IsInvalid||WaitForSingleObject(process,0)!=0)return null;
        if(GetProcessId(process)!=ProcessId||!GetProcessTimes(process,out ulong creation,out _,out _,out _)||creation!=CreationFileTime||!GetExitCodeProcess(process,out uint exitCode))throw new InvalidOperationException("Synthetic original process exit identity could not be proven.");
        return exitCode;
    }
    internal bool VerifyRecordedDescendantForSynthetic(uint pid,long creationTicks)
    {
        if(pid==0||pid==ProcessId||creationTicks<=0||job is null||job.IsClosed||job.IsInvalid)return false;
        // Query information and synchronization are read-only observation rights.
        // This handle never becomes an owner and is closed before returning.
        using SafeFileHandle observed=OpenProcessForSynthetic(0x00100400,false,pid);
        if(observed.IsInvalid||GetProcessId(observed)!=pid||WaitForSingleObject(observed,0)!=258||!GetProcessTimes(observed,out ulong creation,out _,out _,out _)||creation>Int64.MaxValue||DateTime.FromFileTimeUtc((long)creation).Ticks!=creationTicks||!IsProcessInJob(observed,job,out bool before)||!before)return false;
        lease.AssertHeld();
        return GetProcessId(observed)==pid&&WaitForSingleObject(observed,0)==258&&GetProcessTimes(observed,out ulong afterCreation,out _,out _,out _)&&afterCreation==creation&&IsProcessInJob(observed,job,out bool after)&&after;
    }
    internal object OriginalIdentityForSynthetic()=>new {processId=ProcessId,creationFileTime=CreationFileTime,exitCode=OriginalExitCodeForSynthetic(),originalHandleRetained=process is not null&&!process.IsClosed&&!process.IsInvalid};
    internal uint[] JobProcessIdsForSynthetic()
    {
        const int limit=128;int bytes=checked(8+limit*IntPtr.Size);
        if(job is null||job.IsClosed||job.IsInvalid)throw new InvalidOperationException("Synthetic job identity is unavailable.");
        IntPtr buffer=Marshal.AllocHGlobal(bytes);
        try
        {
            if(!QueryJobProcessList(job,3,buffer,(uint)bytes,out uint returned))throw new Win32Exception(Marshal.GetLastWin32Error());
            uint assigned=unchecked((uint)Marshal.ReadInt32(buffer,0)),count=unchecked((uint)Marshal.ReadInt32(buffer,4));
            if(returned<8||returned>bytes||assigned>limit||count>limit||count>assigned||8+(ulong)count*(uint)IntPtr.Size>returned)throw new InvalidDataException("Synthetic job PID inventory exceeds its bounds.");
            var result=new uint[checked((int)count)];
            for(int index=0;index<result.Length;index++){long pid=Marshal.ReadIntPtr(buffer,8+index*IntPtr.Size).ToInt64();if(pid<=0||pid>UInt32.MaxValue)throw new InvalidDataException("Synthetic job process identity is invalid.");result[index]=(uint)pid;}
            return result;
        }
        finally {Marshal.FreeHGlobal(buffer);}
    }
    internal object[] ObserveJobMembersForSynthetic()
    {
        const long fileBound=32L*1024*1024,totalBound=64L*1024*1024;
        long remaining=totalBound;var observations=new List<object>();
        foreach(uint pid in JobProcessIdsForSynthetic())
        {
            // Observation never becomes lifecycle ownership. In particular the
            // original owner is never reopened through a numeric PID.
            if(pid==ProcessId){observations.Add(new{processId=pid,verified=false,category="original-owner-not-reopened"});continue;}
            try
            {
                using SafeFileHandle observed=OpenProcessForSynthetic(0x0400,false,pid); // Query information only.
                if(observed.IsInvalid){observations.Add(new{processId=pid,verified=false,category="query-unavailable"});continue;}
                if(job is null||job.IsClosed||job.IsInvalid||GetProcessId(observed)!=pid||!GetProcessTimes(observed,out ulong creation,out _,out _,out _)||!IsProcessInJob(observed,job,out bool before)||!before)
                {observations.Add(new{processId=pid,verified=false,category="membership-unverified"});continue;}
                var image=new StringBuilder(2048);uint length=(uint)image.Capacity;
                if(!QueryFullProcessImageName(observed,0,image,ref length)||length==0||length>=image.Capacity)
                {observations.Add(new{processId=pid,verified=false,category="image-unavailable"});continue;}
                string name=Path.GetFileName(image.ToString());
                if(name.Length==0||name.Length>255||name.Any(Char.IsControl)||!name.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))
                {observations.Add(new{processId=pid,verified=false,category="image-name-invalid"});continue;}
                string digest;
                using(var file=new FileStream(image.ToString(),FileMode.Open,FileAccess.Read,FileShare.Read,65536,FileOptions.SequentialScan))
                {
                    long expected=file.Length;
                    if(expected<1||expected>fileBound||expected>remaining){observations.Add(new{processId=pid,verified=false,category="file-byte-bound"});continue;}
                    using var hash=System.Security.Cryptography.IncrementalHash.CreateHash(System.Security.Cryptography.HashAlgorithmName.SHA256);
                    byte[] buffer=new byte[65536];long bytes=0;
                    while(bytes<expected)
                    {
                        int read=file.Read(buffer,0,checked((int)Math.Min(buffer.Length,expected-bytes)));if(read==0)break;
                        bytes+=read;remaining-=read;
                        if(bytes>fileBound||remaining<0)throw new InvalidDataException("Synthetic executable hashing exceeds its byte bound.");
                        hash.AppendData(buffer,0,read);
                    }
                    if(bytes!=expected||file.Length!=expected)throw new InvalidDataException("Synthetic executable bytes changed during observation.");
                    digest=Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
                }
                if(GetProcessId(observed)!=pid||!GetProcessTimes(observed,out ulong afterCreation,out _,out _,out _)||afterCreation!=creation||!IsProcessInJob(observed,job,out bool after)||!after)
                {observations.Add(new{processId=pid,verified=false,category="identity-race"});continue;}
                observations.Add(new{processId=pid,creationFileTime=creation,verified=true,category="exact-job-member",executableBasename=name,executableSha256=digest});
            }
            catch(Exception error)when(error is IOException or UnauthorizedAccessException or Win32Exception or ArgumentException)
            {observations.Add(new{processId=pid,verified=false,category="observation-unavailable",hResult=error.HResult});}
        }
        return observations.ToArray();
    }
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool GetExitCodeProcess(SafeFileHandle process,out uint exitCode);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern uint GetProcessId(SafeFileHandle process);
    [DllImport("kernel32.dll",EntryPoint="QueryInformationJobObject",SetLastError=true)]private static extern bool QueryJobProcessList(SafeFileHandle job,int info,IntPtr buffer,uint length,out uint returned);
    [DllImport("kernel32.dll",EntryPoint="OpenProcess",SetLastError=true)]private static extern SafeFileHandle OpenProcessForSynthetic(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool IsProcessInJob(SafeFileHandle process,SafeFileHandle job,out bool result);
    [DllImport("kernel32.dll",EntryPoint="QueryFullProcessImageNameW",CharSet=CharSet.Unicode,SetLastError=true)]private static extern bool QueryFullProcessImageName(SafeFileHandle process,uint flags,StringBuilder name,ref uint length);
#endif
    private void Start(string executable,string arguments,string directory,IReadOnlyDictionary<string,string>? environment)
    {
        if(createAttempted||Released)throw new InvalidOperationException("Exactly one contained launch is permitted.");lease.AssertHeld();writableDirectories?.AssertHeld();
        job=CreateJobObject(IntPtr.Zero,null);
        if(job.IsInvalid){int error=Marshal.GetLastWin32Error();ReleaseBeforeSpawnIfKnown();throw new Win32Exception(error);}
        var limits=new ExtendedLimits();limits.Basic.LimitFlags=0x2000; // KILL_ON_JOB_CLOSE, no breakaway flags.
        if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf<ExtendedLimits>())){int error=Marshal.GetLastWin32Error();ReleaseBeforeSpawnIfKnown();throw new Win32Exception(error);}
        var startup=new StartupInfo { Size=(uint)Marshal.SizeOf<StartupInfo>() };
        IntPtr environmentBlock=IntPtr.Zero;ProcessInformation child;
        try
        {
            if(environment is not null)environmentBlock=Marshal.StringToHGlobalUni(String.Join("\0",environment.OrderBy(value=>value.Key,StringComparer.OrdinalIgnoreCase).Select(value=>value.Key+"="+value.Value))+"\0\0");
            createAttempted=true;
            if(!CreateProcess(executable,new StringBuilder("\""+executable+"\" "+arguments),IntPtr.Zero,IntPtr.Zero,false,0x08000404,environmentBlock,directory,ref startup,out child))
            {int error=Marshal.GetLastWin32Error();job.Dispose();job=null;lease.Release();writableDirectories?.Release();writableDirectories=null;Released=true;throw new Win32Exception(error);}
        }
        finally { if(environmentBlock!=IntPtr.Zero)Marshal.FreeHGlobal(environmentBlock); }
        process=new SafeFileHandle(child.Process,true);using var thread=new SafeFileHandle(child.Thread,true);ProcessId=child.ProcessId;
        // Keep an ownership reference even if containment or identity inspection fails.
        retained.TryAdd(this,0);
        if(!AssignProcessToJobObject(job,process))
        {
            int error=Marshal.GetLastWin32Error();
            // The unassigned child is still suspended and therefore has no descendants.
            if(TerminateProcess(process,1)&&WaitForSingleObject(process,10000)==0){process.Dispose();process=null;job.Dispose();job=null;lease.Release();writableDirectories?.Release();writableDirectories=null;Released=true;retained.TryRemove(this,out _);}
            throw new Win32Exception(error);
        }
        contained=true;
        if(!GetProcessTimes(process,out var creation,out _,out _,out _))throw new Win32Exception(Marshal.GetLastWin32Error());
        CreationFileTime=creation;
        lease.AssertHeld();
        if(ResumeThread(thread)==uint.MaxValue)throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<OllamaContainedProcess,byte> retained=new();
    internal uint ActiveProcesses()
    {
        if(Released)return 0;
        if(job is null||job.IsClosed||job.IsInvalid)throw new InvalidOperationException("Contained job identity is unavailable.");
        if(!QueryInformationJobObject(job,1,out Accounting accounting,(uint)Marshal.SizeOf<Accounting>(),IntPtr.Zero))throw new Win32Exception(Marshal.GetLastWin32Error());
        return accounting.ActiveProcesses;
    }
    internal bool ReleaseAfterTreeExit()
    {
        if(Released)return true;
        if(ActiveProcesses()!=0)return false;
        if(process is null||process.IsClosed||process.IsInvalid||WaitForSingleObject(process,0)!=0)return false;
        lease.AssertHeld();lease.Release();writableDirectories?.Release();writableDirectories=null;process.Dispose();process=null;job!.Dispose();job=null;Released=true;retained.TryRemove(this,out _);return true;
    }
    internal void Stop()
    {
        if(Released)return;lease.AssertHeld();_ = ActiveProcesses();
        if(!contained)
        {
            if(process is null||process.IsClosed||process.IsInvalid||!TerminateProcess(process,1))throw new InvalidOperationException("Suspended launch cleanup could not confirm termination.");
            return;
        }
        if(!TerminateJobObject(job!,1))throw new Win32Exception(Marshal.GetLastWin32Error());
        // Termination is asynchronous. Do not release here.
    }
    [StructLayout(LayoutKind.Sequential)] private struct BasicLimits { public long ProcessTime,JobTime;public uint LimitFlags;public UIntPtr MinimumWorkingSet,MaximumWorkingSet;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass; }
    [StructLayout(LayoutKind.Sequential)] private struct IoCounters { public ulong ReadOperations,WriteOperations,OtherOperations,ReadBytes,WriteBytes,OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] private struct ExtendedLimits { public BasicLimits Basic;public IoCounters Io;public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory; }
    [StructLayout(LayoutKind.Sequential)] private struct Accounting { public long User,Kernel,PeriodUser,PeriodKernel;public uint PageFaults,TotalProcesses,ActiveProcesses,TerminatedProcesses; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] private struct StartupInfo { public uint Size;public string? Reserved,Desktop,Title;public uint X,Y,XSize,YSize,XChars,YChars,Fill,Flags;public ushort Show,ReservedBytes;public IntPtr ReservedPointer,Input,Output,Error; }
    [StructLayout(LayoutKind.Sequential)] private struct ProcessInformation { public IntPtr Process,Thread;public uint ProcessId,ThreadId; }
    [DllImport("kernel32.dll",EntryPoint="CreateJobObjectW",CharSet=CharSet.Unicode,SetLastError=true)]private static extern SafeFileHandle CreateJobObject(IntPtr attributes,string? name);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool SetInformationJobObject(SafeFileHandle job,int info,ref ExtendedLimits limits,uint length);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool QueryInformationJobObject(SafeFileHandle job,int info,out Accounting accounting,uint length,IntPtr returned);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool AssignProcessToJobObject(SafeFileHandle job,SafeFileHandle process);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool TerminateJobObject(SafeFileHandle job,uint exit);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool TerminateProcess(SafeFileHandle process,uint exit);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern uint WaitForSingleObject(SafeFileHandle handle,uint milliseconds);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern uint ResumeThread(SafeFileHandle thread);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool GetProcessTimes(SafeFileHandle process,out ulong creation,out ulong exit,out ulong kernel,out ulong user);
    [DllImport("kernel32.dll",EntryPoint="CreateProcessW",CharSet=CharSet.Unicode,SetLastError=true)]private static extern bool CreateProcess(string executable,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string? directory,ref StartupInfo startup,out ProcessInformation information);
}
