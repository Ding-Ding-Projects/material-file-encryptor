using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using MaterialFileEncryptor.Host;

if(!OperatingSystem.IsWindows())throw new PlatformNotSupportedException();
static string OwnedSignal(string[] arguments)
{
    if(arguments.Length!=3)throw new ArgumentException("Synthetic child arguments are invalid.");
    string signal=Path.GetFullPath(arguments[1]),root=Path.GetDirectoryName(signal)!,name=Path.GetFileName(root);
    const string prefix="mfe-ollama-lifetime-";
    if(!name.StartsWith(prefix,StringComparison.Ordinal)||!Guid.TryParseExact(name[prefix.Length..],"N",out _)||!String.Equals(Path.GetDirectoryName(root)?.TrimEnd(Path.DirectorySeparatorChar),Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase)||Path.GetFileName(signal) is not ("descendant-ready" or "registry-ready"))throw new ArgumentException("Synthetic child signal is outside its owned fixture.");
    return signal;
}
static string OwnedDiagnostics(string[] arguments)
{
    string root=Path.GetFullPath(arguments[2]),name=Path.GetFileName(root);const string prefix="mfe-ollama-diagnostics-";
    if(!name.StartsWith(prefix,StringComparison.Ordinal)||!Guid.TryParseExact(name[prefix.Length..],"N",out _)||!String.Equals(Path.GetDirectoryName(root)?.TrimEnd(Path.DirectorySeparatorChar),Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar),StringComparison.OrdinalIgnoreCase)||!Directory.Exists(root))throw new ArgumentException("Synthetic diagnostics are outside their owned fixture.");
    return root;
}
static string Category(Exception error)=>error switch { System.ComponentModel.Win32Exception=>"win32",IOException=>"io",UnauthorizedAccessException=>"access",InvalidOperationException=>"invalid-operation",ArgumentException=>"argument",_=>"other" };
static void Marker(string diagnostics,string signal,string suffix,string category,int hResult=0,int? childId=null,long? childCreation=null,string? exceptionType=null,string? stage=null)
{
    string json=JsonSerializer.Serialize(new { category,hResult,runtime8=Environment.Version.Major==8,dotnetRootPresent=!String.IsNullOrEmpty(Environment.GetEnvironmentVariable("DOTNET_ROOT")),processId=Environment.ProcessId,childId,childCreation,exceptionType,stage });
    if(json.Length>1024)throw new InvalidOperationException("Synthetic marker exceeds its bound.");
    File.WriteAllText(Path.Combine(diagnostics,Path.GetFileName(signal)+suffix),json);
}
if(args.Length>0&&args[0] is "--parent" or "--descendant")
{
    string childSignal=OwnedSignal(args),childDiagnostics=OwnedDiagnostics(args);bool parent=args[0]=="--parent";string stage="entered-marker";
    try
    {
        Marker(childDiagnostics,childSignal,parent?".parent-entered":".descendant-entered",parent?"parent-entered":"descendant-entered");
        if(parent)
        {
            stage="descendant-start";
            using Process child=Process.Start(new ProcessStartInfo(Environment.ProcessPath!) { UseShellExecute=false,CreateNoWindow=true,ArgumentList={"--descendant",childSignal,childDiagnostics} })??throw new InvalidOperationException("Synthetic descendant creation returned no process.");
            stage="descendant-identity";
            Marker(childDiagnostics,childSignal,".parent-started","descendant-started",childId:child.Id,childCreation:child.StartTime.ToUniversalTime().Ticks);
        }
        else { stage="signal-write";File.WriteAllText(childSignal,"ready");await Task.Delay(60000); }
    }
    catch(Exception error)
    {
        Environment.ExitCode=1;
        try { Marker(childDiagnostics,childSignal,parent?".parent-failure":".descendant-failure",Category(error),error.HResult,exceptionType:error.GetType().FullName,stage:stage); }
        catch { Environment.ExitCode=2; }
    }
    return;
}
static object ReadMarker(string diagnostics,string signal,string suffix)
{
    string filename=Path.Combine(diagnostics,Path.GetFileName(signal)+suffix);
    if(!File.Exists(filename))return new {present=false,valid=false};
    try
    {
        if(new FileInfo(filename).Length>1024)return new{present=true,valid=false};
        using var document=JsonDocument.Parse(File.ReadAllText(filename));var value=document.RootElement;
        string? category=value.GetProperty("category").GetString();
        if(category is not ("parent-entered" or "descendant-entered" or "descendant-started" or "win32" or "io" or "access" or "invalid-operation" or "argument" or "other"))return new{present=true,valid=false};
        int? childId=value.GetProperty("childId").ValueKind==JsonValueKind.Null?null:value.GetProperty("childId").GetInt32();
        long? childCreation=value.GetProperty("childCreation").ValueKind==JsonValueKind.Null?null:value.GetProperty("childCreation").GetInt64();
        string? exceptionType=value.GetProperty("exceptionType").GetString(),stage=value.GetProperty("stage").GetString();
        if(exceptionType is not null&&(exceptionType.Length>128||exceptionType.Any(character=>!Char.IsLetterOrDigit(character)&&character is not ('.' or '+' or '_'))))return new{present=true,valid=false};
        if(stage is not (null or "entered-marker" or "descendant-start" or "descendant-identity" or "signal-write"))return new{present=true,valid=false};
        return new{present=true,valid=true,category,hResult=value.GetProperty("hResult").GetInt32(),runtime8=value.GetProperty("runtime8").GetBoolean(),dotnetRootPresent=value.GetProperty("dotnetRootPresent").GetBoolean(),processId=value.GetProperty("processId").GetInt32(),childId,childCreation,exceptionType,stage};
    }
    catch { return new{present=true,valid=false}; }
}
static void Require(bool condition,string description) { if(!condition)throw new InvalidOperationException(description); }
static bool Prevented(Action action) { try { action();return false; } catch(IOException) { return true; } catch(UnauthorizedAccessException) { return true; } }
static JsonElement Params(object value)=>JsonSerializer.SerializeToElement(value);
static (uint Parent,uint Child,long Creation)? RecordedDescendant(string diagnostics,string signal)
{
    JsonElement started=Params(ReadMarker(diagnostics,signal,".parent-started")),entered=Params(ReadMarker(diagnostics,signal,".descendant-entered"));
    if(!started.TryGetProperty("valid",out var valid)||!valid.GetBoolean()||!entered.TryGetProperty("valid",out var descendantValid)||!descendantValid.GetBoolean())return null;
    if(!started.GetProperty("childId").TryGetUInt32(out uint child)||child==0||!started.GetProperty("processId").TryGetUInt32(out uint parent)||parent==0||!started.GetProperty("childCreation").TryGetInt64(out long creation)||creation<=0||!entered.GetProperty("processId").TryGetUInt32(out uint actual)||actual!=child)return null;
    return(parent,child,creation);
}
static bool DescendantIsLive(OllamaContainedProcess owner,string diagnostics,string signal)
{
    var recorded=RecordedDescendant(diagnostics,signal);
    return recorded is not null&&owner.ProcessId==recorded.Value.Parent&&owner.OriginalExitCodeForSynthetic() is not null&&owner.VerifyRecordedDescendantForSynthetic(recorded.Value.Child,recorded.Value.Creation);
}
static async Task<bool> RegistryDescendantIsLive(OllamaRuntimeBroker broker,string id,string diagnostics,string signal)
{
    var recorded=RecordedDescendant(diagnostics,signal);
    return recorded is not null&&await broker.VerifySyntheticDescendantAsync(id,recorded.Value.Parent,recorded.Value.Child,recorded.Value.Creation);
}
static async Task<bool> Rejected(Func<Task<object>> action) { try { await action();return false; } catch(ArgumentException) { return true; } }
string executable=Environment.ProcessPath!;
Require(Path.GetFileNameWithoutExtension(executable)=="MaterialFileEncryptor.OllamaLifetime.Verifier","Run the verifier apphost directly.");
string fixture=Path.Combine(Path.GetTempPath(),"mfe-ollama-lifetime-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(fixture);
string diagnostics=Path.Combine(Path.GetTempPath(),"mfe-ollama-diagnostics-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(diagnostics);
string member=Path.Combine(fixture,"member.dll"),signal=Path.Combine(fixture,"descendant-ready");File.WriteAllText(member,"synthetic admitted member");
string hash=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(member))).ToLowerInvariant();
var lease=OllamaRuntimeLease.AcquireSynthetic(fixture,new Dictionary<string,string>{{"member.dll",hash}});
OllamaContainedProcess? owner=null;
bool verificationCompleted=false;
try
{
    Require(Prevented(()=>File.WriteAllText(member,"changed")),"Retained member must reject mutation.");
    Require(Prevented(()=>File.Delete(member)),"Retained member must reject deletion.");
    OllamaContainedProcess.StartSynthetic(lease,executable,"--parent \""+signal+"\" \""+diagnostics+"\"",out owner);
    DateTime deadline=DateTime.UtcNow.AddSeconds(10);
    while((!File.Exists(signal)||!DescendantIsLive(owner,diagnostics,signal))&&DateTime.UtcNow<deadline)await Task.Delay(25);
    Console.WriteLine(JsonSerializer.Serialize(new {syntheticDescendantIdentity=true,original=owner.OriginalIdentityForSynthetic(),recordedDescendantLiveInExactJob=DescendantIsLive(owner,diagnostics,signal),accountingAtAssertion=owner.ActiveProcesses(),memberObservations=owner.ObserveJobMembersForSynthetic(),descendantMemberProtected=Prevented(()=>File.WriteAllText(member,"synthetic reference diagnostic mutation")),runtimeLeaseRetained=!lease.Released}));
    if(!File.Exists(signal)||!DescendantIsLive(owner,diagnostics,signal))
    {
        uint? originalExitCode=null;bool exitCodeAvailable=true;
        try{originalExitCode=owner.OriginalExitCodeForSynthetic();}catch{exitCodeAvailable=false;}
        Console.WriteLine(JsonSerializer.Serialize(new {syntheticDiagnostic=true,signalPresent=File.Exists(signal),activeProcesses=owner.ActiveProcesses(),originalExitCode,exitCodeAvailable,parentEntered=ReadMarker(diagnostics,signal,".parent-entered"),parentStarted=ReadMarker(diagnostics,signal,".parent-started"),parentFailure=ReadMarker(diagnostics,signal,".parent-failure"),descendantEntered=ReadMarker(diagnostics,signal,".descendant-entered"),descendantFailure=ReadMarker(diagnostics,signal,".descendant-failure")}));
    }
    Require(File.Exists(signal)&&DescendantIsLive(owner,diagnostics,signal),"The exact original parent must exit while its recorded descendant remains live in the retained job.");
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
    var broker=OllamaRuntimeBroker.ForSynthetic(fixture,()=>OllamaRuntimeLease.AcquireSynthetic(registryRoot,registryMembers),executable,"--parent \""+registrySignal+"\" \""+diagnostics+"\"");
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
        while((!File.Exists(registrySignal)||!await RegistryDescendantIsLive(broker,operationId,diagnostics,registrySignal))&&DateTime.UtcNow<deadline)await Task.Delay(25);
        Require(File.Exists(registrySignal)&&await RegistryDescendantIsLive(broker,operationId,diagnostics,registrySignal),"Exact registry descendant must remain live in the retained job after original parent exit.");
        await Task.WhenAll(broker.DispatchAsync("managedOllama.stop",Params(new{operationId})),broker.DispatchAsync("managedOllama.close",Params(new{operationId})));
        JsonElement stopped=Params(await broker.DispatchAsync("managedOllama.status",Params(new{operationId})));
        Require(stopped.GetProperty("exitVerified").GetBoolean()&&stopped.GetProperty("leaseReleased").GetBoolean(),"Concurrent stop and close must settle the exact registry owner.");
        File.Delete(registrySignal);
        JsonElement eofStarted=Params(await broker.DispatchAsync("managedOllama.start",Params(new{port=11435})));
        string eofId=eofStarted.GetProperty("operationId").GetString()!;
        deadline=DateTime.UtcNow.AddSeconds(10);
        while((!File.Exists(registrySignal)||!await RegistryDescendantIsLive(broker,eofId,diagnostics,registrySignal))&&DateTime.UtcNow<deadline)await Task.Delay(25);
        Require(File.Exists(registrySignal)&&await RegistryDescendantIsLive(broker,eofId,diagnostics,registrySignal),"Exact EOF descendant must remain live in the retained job after original parent exit.");
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
    verificationCompleted=true;
}
finally
{
    if(owner is not null&&!owner.Released){owner.Stop();DateTime deadline=DateTime.UtcNow.AddSeconds(10);while(!owner.ReleaseAfterTreeExit()&&DateTime.UtcNow<deadline)await Task.Delay(25);}
    if(owner is null)lease.Release();
    if(lease.Released){Directory.Delete(fixture,true);if(verificationCompleted)Directory.Delete(diagnostics,true);}
}
