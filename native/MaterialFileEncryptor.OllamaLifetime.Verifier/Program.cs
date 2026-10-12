using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using MaterialFileEncryptor.Host;

if(!OperatingSystem.IsWindows())throw new PlatformNotSupportedException();
if(args.Length>0&&args[0]=="--descendant") { File.WriteAllText(args[1],"ready");await Task.Delay(60000);return; }
if(args.Length>0&&args[0]=="--parent")
{
    Process.Start(new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute=false,CreateNoWindow=true,ArgumentList={"--descendant",args[1]} })!.Dispose();
    return;
}
static void Require(bool condition,string description) { if(!condition)throw new InvalidOperationException(description); }
static bool Prevented(Action action) { try { action();return false; } catch(IOException) { return true; } catch(UnauthorizedAccessException) { return true; } }
static JsonElement Params(object value)=>JsonSerializer.SerializeToElement(value);
static async Task<bool> Rejected(Func<Task<object>> action) { try { await action();return false; } catch(ArgumentException) { return true; } }
string executable=Environment.ProcessPath!;
Require(Path.GetFileNameWithoutExtension(executable)=="MaterialFileEncryptor.OllamaLifetime.Verifier","Run the verifier apphost directly.");
string fixture=Path.Combine(Path.GetTempPath(),"mfe-ollama-lifetime-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(fixture);
string member=Path.Combine(fixture,"member.dll"),signal=Path.Combine(fixture,"descendant-ready");File.WriteAllText(member,"synthetic admitted member");
string hash=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(member))).ToLowerInvariant();
var lease=OllamaRuntimeLease.AcquireSynthetic(fixture,new Dictionary<string,string>{{"member.dll",hash}});
OllamaContainedProcess? owner=null;
try
{
    Require(Prevented(()=>File.WriteAllText(member,"changed")),"Retained member must reject mutation.");
    Require(Prevented(()=>File.Delete(member)),"Retained member must reject deletion.");
    OllamaContainedProcess.StartSynthetic(lease,executable,"--parent \""+signal+"\"",out owner);
    DateTime deadline=DateTime.UtcNow.AddSeconds(10);
    while((!File.Exists(signal)||owner.ActiveProcesses()!=1)&&DateTime.UtcNow<deadline)await Task.Delay(25);
    Require(File.Exists(signal)&&owner.ActiveProcesses()==1,"The original parent must exit while its descendant remains in the exact job.");
    Require(!owner.ReleaseAfterTreeExit()&&!lease.Released,"Parent exit must retain the whole runtime lease.");
    Require(Prevented(()=>File.WriteAllText(member,"changed after parent exit")),"Live descendant must retain member protection.");
    // This negative capability test must never be reported as insertion isolation.
    string inserted=Path.Combine(fixture,"unlisted.dll");bool insertionPrevented=Prevented(()=>File.WriteAllText(inserted,"unlisted"));
    owner.Stop();deadline=DateTime.UtcNow.AddSeconds(10);
    while(!owner.ReleaseAfterTreeExit()&&DateTime.UtcNow<deadline)await Task.Delay(25);
    Require(owner.Released&&lease.Released,"Exact zero-member job must release the lease.");
    File.WriteAllText(member,"released");
    string registryRoot=Path.Combine(fixture,"registry"),registrySignal=Path.Combine(fixture,"registry-ready");Directory.CreateDirectory(registryRoot);
    string registryMember=Path.Combine(registryRoot,"member.dll");File.WriteAllText(registryMember,"registry admitted member");
    string registryHash=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(registryMember))).ToLowerInvariant();
    var registryMembers=new Dictionary<string,string>{{"member.dll",registryHash}};
    string extra=Path.Combine(registryRoot,"unexpected-empty");Directory.CreateDirectory(extra);
    bool unexpectedDirectoryRejected=false;
    try { var invalid=OllamaRuntimeLease.AcquireSynthetic(registryRoot,registryMembers);invalid.Release(); }
    catch(InvalidDataException) { unexpectedDirectoryRejected=true; }
    finally { Directory.Delete(extra); }
    Require(unexpectedDirectoryRejected,"Unknown empty directory must be rejected before traversal.");
    var broker=OllamaRuntimeBroker.ForSynthetic(fixture,()=>OllamaRuntimeLease.AcquireSynthetic(registryRoot,registryMembers),executable,"--parent \""+registrySignal+"\"");
    try
    {
        Require(await Rejected(()=>broker.DispatchAsync("managedOllama.start",Params(new{port=1023}))),"Invalid port must be rejected.");
        Require(await Rejected(()=>broker.DispatchAsync("managedOllama.start",Params(new{port=11434,path=registryRoot}))),"Caller path must be rejected.");
        Require(await Rejected(()=>broker.DispatchAsync("managedOllama.start",Params(new{port=11434,env=new{HOME=fixture}}))),"Caller environment must be rejected.");
        Require(await Rejected(()=>broker.DispatchAsync("managedOllama.start",Params(new{port=11434,argv=new[]{"serve"}}))),"Caller arguments must be rejected.");
        Require(await Rejected(()=>broker.DispatchAsync("managedOllama.stop",Params(new{operationId=Guid.NewGuid().ToString("N")}))),"Unknown opaque identity must be rejected.");
        JsonElement started=Params(await broker.DispatchAsync("managedOllama.start",Params(new{port=11434})));
        string operationId=started.GetProperty("operationId").GetString()!;
        Require(started.GetProperty("phase").GetString()=="running","Synthetic registry start must return running.");
        deadline=DateTime.UtcNow.AddSeconds(10);
        while(!File.Exists(registrySignal)&&DateTime.UtcNow<deadline)await Task.Delay(25);
        Require(File.Exists(registrySignal),"Registry descendant must start.");
        await Task.WhenAll(broker.DispatchAsync("managedOllama.stop",Params(new{operationId})),broker.DispatchAsync("managedOllama.close",Params(new{operationId})));
        JsonElement stopped=Params(await broker.DispatchAsync("managedOllama.status",Params(new{operationId})));
        Require(stopped.GetProperty("exitVerified").GetBoolean()&&stopped.GetProperty("leaseReleased").GetBoolean(),"Concurrent stop and close must settle the exact registry owner.");
        File.Delete(registrySignal);
        JsonElement eofStarted=Params(await broker.DispatchAsync("managedOllama.start",Params(new{port=11435})));
        string eofId=eofStarted.GetProperty("operationId").GetString()!;
        deadline=DateTime.UtcNow.AddSeconds(10);
        while(!File.Exists(registrySignal)&&DateTime.UtcNow<deadline)await Task.Delay(25);
        Require(File.Exists(registrySignal),"EOF descendant must start.");
        Require(await broker.CloseAllAsync(),"EOF close must settle every exact owner.");
        JsonElement eofStopped=Params(await broker.DispatchAsync("managedOllama.status",Params(new{operationId=eofId})));
        Require(eofStopped.GetProperty("exitVerified").GetBoolean()&&eofStopped.GetProperty("leaseReleased").GetBoolean()&&!eofStopped.GetProperty("startAvailable").GetBoolean(),"EOF must release settled leases and prohibit another start.");
    }
    finally { Require(await broker.CloseAllAsync(),"Synthetic broker teardown must retain or settle every owner."); }
    int acquisitions=0;
    var recovery=OllamaRuntimeBroker.ForSynthetic(fixture,()=>
    {
        if(++acquisitions>64)throw new InvalidDataException("Synthetic acquisition failure after retention pruning.");
        return OllamaRuntimeLease.AcquireSynthetic(registryRoot,registryMembers);
    },Path.Combine(fixture,"missing-synthetic.exe"),"");
    try
    {
        // Exercise the real no-child launch-failure path. Each retained record
        // releases its lease without claiming process-exit proof.
        for(int index=0;index<64;index++)
        {
            JsonElement failed=Params(await recovery.DispatchAsync("managedOllama.start",Params(new{port=11434})));
            Require(failed.GetProperty("phase").GetString()=="stopped"&&failed.GetProperty("leaseReleased").GetBoolean()&&!failed.GetProperty("exitVerified").GetBoolean(),"Known no-child launch failure must release without fictional exit proof.");
        }
        bool acquisitionFailed=false;
        try { await recovery.DispatchAsync("managedOllama.start",Params(new{port=11434})); }
        catch(InvalidDataException) { acquisitionFailed=true; }
        Require(acquisitionFailed,"The post-pruning acquisition negative control must fail.");
        JsonElement recovered=Params(await recovery.DispatchAsync("managedOllama.status",Params(new{})));
        Require(recovered.GetProperty("phase").GetString()=="idle"&&recovered.GetProperty("operationId").ValueKind==JsonValueKind.Null,"Default status must recover after latest record is pruned and acquisition fails.");
    }
    finally { Require(await recovery.CloseAllAsync(),"Retention-bound negative-control teardown must settle."); }
    Console.WriteLine(JsonSerializer.Serialize(new { synthetic=true,officialRuntimeExecuted=false,parentExitRetainsLease=true,descendantContained=true,exactTreeExitReleasesLease=true,registryUnknownIdRejected=true,concurrentStopCloseSettled=true,invalidAuthorityFieldsRejected=true,unexpectedDirectoryRejected,eofCloseSettled=true,retentionBoundAcquisitionFailureRecovered=true,directoryInsertionPrevented=insertionPrevented,productionStartAvailable=false,hostDeathOrderingVerified=false }));
}
finally
{
    if(owner is not null&&!owner.Released){owner.Stop();DateTime deadline=DateTime.UtcNow.AddSeconds(10);while(!owner.ReleaseAfterTreeExit()&&DateTime.UtcNow<deadline)await Task.Delay(25);}
    if(owner is null)lease.Release();
    if(lease.Released)Directory.Delete(fixture,true);
}
