using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.MemoryMappedFiles;
using System.Security.Cryptography;
using System.Text.Json;

if(args.Length==1&&args[0]=="--settlement-self-test"){await DetachSettlement.SelfTest();await MountedTeardown.SelfTest();return;}

if(args.Length==1&&args[0]=="--teardown-self-test"){await BoundedProcessStop.SelfTest();await ChildDiagnostics.SelfTest();HelperAdmission.SelfTest();return;}

if(args.Length==4&&args[0]=="--mapped-writer-child"){MappedWriter.Run(args[1],args[2],args[3]);return;}

if(args.Length is <4 or >5)throw new ArgumentException("Supply package root, private output JSON, exact source commit, expected helper SHA-256 from the production receipt and optional --ordinary-only.");
bool ordinaryOnly=args.Length==5&&args[4]=="--ordinary-only";
if(args.Length==5&&!ordinaryOnly)throw new ArgumentException("Unknown verification mode.");
string package=Path.GetFullPath(args[0]),output=Path.GetFullPath(args[1]),sourceCommit=args[2];
if(sourceCommit.Length!=40||!sourceCommit.All(Uri.IsHexDigit))throw new ArgumentException("A full source commit is required.");
string executable=Path.Combine(package,"resources","native","MaterialFileEncryptor.Host.exe");
if(!File.Exists(executable))throw new FileNotFoundException("Packaged native helper is missing.");
string admittedHelperSha256=HelperAdmission.Verify(executable,args[3]);
if(new[]{output,output+".fixture.json",output+".progress.json"}.Any(File.Exists))throw new IOException("Use a fresh output path; existing lifecycle evidence is retained.");
string root=Path.Combine(Path.GetTempPath(),"mfe-mounted-lifecycle-"+Guid.NewGuid().ToString("N"));
string storage=Path.Combine(root,"storage"),cache=Path.Combine(root,"cache");Directory.CreateDirectory(root);
string historyName=Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(storage.ToUpperInvariant()+"|folder|"))).ToLowerInvariant();
string history=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MaterialFileEncryptor-Data","History",historyName);
if(Directory.Exists(history))throw new InvalidOperationException("Synthetic history destination already exists.");
Directory.CreateDirectory(Path.GetDirectoryName(output)!);await File.WriteAllTextAsync(output+".fixture.json",JsonSerializer.Serialize(new{root,storage,cache,history,executable},new JsonSerializerOptions{WriteIndented=true}));
string password=Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
var checks=new List<object>();string? drive=null;bool mounted=false,finished=false,cleanup=false;MountedHelper? helper=null;bool writerExitEstablished=true;int? writerId=null;DateTime? writerStartedUtc=null;ProcessStopResult? writerStop=null;string? originalException=null;bool protocolOutcomeUnknown=false;MountedTeardown.Disposition? helperDisposition=null;
async Task PersistProgress()=>await File.WriteAllTextAsync(output+".progress.json",JsonSerializer.Serialize(new{sourceCommit,checks,originalException,writerId,writerStartedUtc,writerExitEstablished,writerStop},new JsonSerializerOptions{WriteIndented=true}));
void Require(bool condition,string message){if(!condition)throw new InvalidOperationException(message);}
async Task Mount()
{
    var status=await helper!.Call("status",new{});
    var available=status.GetProperty("availableDriveLetters").EnumerateArray().Select(value=>value.GetString()!).ToArray();
    drive=available.LastOrDefault()??throw new InvalidOperationException("No unused drive letter is available.");
    Require(!DriveInfo.GetDrives().Any(value=>value.Name.StartsWith(drive,StringComparison.OrdinalIgnoreCase)),"Selected drive became occupied.");
    var result=await helper.Call("mount",new{driveLetter=drive});Require(result.GetProperty("mounted").GetBoolean(),"Synthetic mount did not complete.");mounted=true;
}
async Task SettleDetach(string phase)
{
    var result=await DetachSettlement.Run((method,timeout)=>helper!.Call(method,new{},timeout),async observation=>{
        if(observation.Error is not null)protocolOutcomeUnknown=true;
        checks.Add(new{name="detach-settlement-observation",phase,observation});await PersistProgress();
    });
    if(result.Terminal is "protocol-timeout" or "protocol-error" or "invalid-response")protocolOutcomeUnknown=true;
    checks.Add(new{name="detach-settlement-terminal",phase,deadlineMilliseconds=DetachSettlement.Deadline.TotalMilliseconds,intervalMilliseconds=DetachSettlement.Interval.TotalMilliseconds,result,verified=result.Terminal=="detached"});
    await PersistProgress();
    if(result.Terminal=="detached")mounted=false;
    Require(!mounted,$"Owned mount settlement did not prove detach ({phase}: {result.Terminal}).");
}
async Task Unlock()=>await helper!.Call("unlock",new{storageDir=storage,cacheDir=cache,password,partSizeBytes=1048576});
try
{
    helper=new MountedHelper(executable,admittedHelperSha256);
    var status=await helper.Call("status",new{});Require(status.GetProperty("driver").GetProperty("available").GetBoolean(),"WinFsp is unavailable.");
    await helper.Call("create",new{storageDir=storage,cacheDir=cache,password,partSizeBytes=1048576});await Mount();
    string mountedRoot=drive+"\\";
    string idleFile=Path.Combine(mountedRoot,"idle.bin");File.WriteAllBytes(idleFile,new byte[]{1,2,3,4});
    using(var idle=new FileStream(idleFile,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
    {
        var result=await helper.Call("forceLock",new{});bool locked=result.GetProperty("locked").GetBoolean();
        Require(!locked&&result.GetProperty("busy").GetBoolean(),"Retained idle handle did not veto force lock.");
        Require(Directory.Exists(mountedRoot),"Busy force lock detached the owned drive.");
        checks.Add(new{name="idle-open-handle-force-lock-busy",verified=true,locked});
    }
    OrdinaryOperations.Run(root,mountedRoot,checks);
    File.WriteAllText(Path.Combine(mountedRoot,"prior.bin"),"existing destination stays intact");
    string small=Path.Combine(root,"completed.txt"),large=Path.Combine(root,"prior.bin");File.WriteAllText(small,"completed batch item");
    using(var stream=File.Create(large)){byte[] block=new byte[65536];RandomNumberGenerator.Fill(block);for(int i=0;i<4096;i++)stream.Write(block);CryptographicOperations.ZeroMemory(block);}
    var start=await helper.Call("startImport",new{paths=new[]{small,large}});string operation=start.GetProperty("operationId").GetString()!;
    var deadline=Stopwatch.StartNew();bool partialObserved=false;
    while(deadline.Elapsed<TimeSpan.FromSeconds(15))
    {
        var rows=await helper.Call("operations",new{});var row=rows.EnumerateArray().Single(value=>value.GetProperty("operationId").GetString()==operation);
        if(row.GetProperty("completedFiles").GetInt32()>=1&&row.GetProperty("state").GetString()=="running"){partialObserved=true;break;}
        if(row.GetProperty("state").GetString() is "failed" or "completed")break;await Task.Delay(10);
    }
    Require(partialObserved,"A live second batch item was not observed for cancellation.");
    var cancelWatch=Stopwatch.StartNew();var cancellation=await helper.Call("cancelOperation",new{operationId=operation});double cancelAck=cancelWatch.Elapsed.TotalMilliseconds;
    string terminal="";
    while(deadline.Elapsed<TimeSpan.FromSeconds(30))
    {
        var rows=await helper.Call("operations",new{});terminal=rows.EnumerateArray().Single(value=>value.GetProperty("operationId").GetString()==operation).GetProperty("state").GetString()!;
        if(terminal is "cancelled" or "completed" or "failed")break;await Task.Delay(10);
    }
    Require(cancellation.GetProperty("accepted").GetBoolean()&&terminal=="cancelled","Managed cancellation did not terminate as cancelled.");
    Require(File.ReadAllText(Path.Combine(mountedRoot,"completed.txt"))=="completed batch item","Completed batch item disappeared.");
    Require(File.ReadAllText(Path.Combine(mountedRoot,"prior.bin"))=="existing destination stays intact","Original destination changed during cancellation.");
    Require(!File.Exists(Path.Combine(mountedRoot,"prior (2).bin")),"Unfinished imported file became visible.");
    checks.Add(new{name="mounted-managed-batch-cancellation",verified=true,cancelAcknowledgementMilliseconds=cancelAck,terminalState=terminal,completedFileRetained=true,originalDestinationRetained=true,incompleteFileAbsent=true});

    bool exactOverlap=false;
    if(!ordinaryOnly)
    {
    string mappedFile=Path.Combine(mountedRoot,"mapped.bin");
    using(var seed=new FileStream(mappedFile,FileMode.CreateNew,FileAccess.Write,FileShare.ReadWrite)){seed.SetLength(64L*1024*1024);seed.Flush(true);}
    string ready=Path.Combine(root,"writer.ready"),stop=Path.Combine(root,"writer.stop");
    var writerStart=new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
    if(Path.GetFileNameWithoutExtension(Environment.ProcessPath!).Equals("dotnet",StringComparison.OrdinalIgnoreCase))writerStart.ArgumentList.Add(typeof(MappedWriter).Assembly.Location);
    foreach(string arg in new[]{"--mapped-writer-child",mappedFile,ready,stop})writerStart.ArgumentList.Add(arg);
    using(var writer=Process.Start(writerStart)!)
    {
        writerExitEstablished=false;writerId=writer.Id;writerStartedUtc=writer.StartTime.ToUniversalTime();
        var writerStdout=new ChildDiagnostics(writer.StandardOutput);var writerStderr=new ChildDiagnostics(writer.StandardError);
        try
        {
            var readyWait=Stopwatch.StartNew();
            while(!File.Exists(ready)&&!writer.HasExited&&readyWait.Elapsed<TimeSpan.FromSeconds(15))await Task.Delay(10);
            Require(File.Exists(ready)&&!writer.HasExited,"Mapped writer did not become ready.");
            bool busyObserved=false;
            for(int attempt=0;attempt<3;attempt++)
            {
                var response=await helper.Call("forceLock",new{});
                checks.Add(new{name="mapped-force-lock-response",attempt,response});
                await PersistProgress();
                bool locked=response.GetProperty("locked").GetBoolean();
                if(locked)mounted=false;
                checks.Add(new{name="retained-mapped-descriptor-force-lock",attempt,verified=!locked&&response.GetProperty("busy").GetBoolean(),locked,code=response.GetProperty("code").GetString(),activeFilesystemIo=response.GetProperty("activeFilesystemIo").GetInt32()});
                await PersistProgress();
                Require(!locked&&response.GetProperty("busy").GetBoolean(),"Force lock detached a retained mapped descriptor.");
                busyObserved=true;
            }
            exactOverlap=busyObserved;
        }
        catch(Exception error)
        {
            originalException=error.GetType().Name+": "+error.Message;
            try { await PersistProgress(); } catch(Exception receiptError) { checks.Add(new{name="progress-write-error",verified=false,type=receiptError.GetType().Name}); }
            throw;
        }
        finally
        {
            writerStop=await BoundedProcessStop.Run(writer,()=>File.WriteAllText(stop,"stop"));
            var stdout=await writerStdout.Finish(TimeSpan.FromSeconds(5));var stderr=await writerStderr.Finish(TimeSpan.FromSeconds(5));
            if(stdout.drainTimedOut||stderr.drainTimedOut||stdout.readError is not null||stderr.readError is not null)writerStop=writerStop with{Errors=writerStop.Errors.Append("child-diagnostic-drain-incomplete").ToArray()};
            writerExitEstablished=writerStop.ExitEstablished;
            checks.Add(new{name="mapped-writer-child-exit",verified=writerExitEstablished&&writer.ExitCode==0&&writerStop.Errors.Length==0&&!stdout.drainTimedOut&&!stderr.drainTimedOut&&stdout.readError is null&&stderr.readError is null,writerId,writerStartedUtc,writerStop,stdout,stderr,exitCode=writerExitEstablished?(int?)writer.ExitCode:null,exitCodeHex=writerExitEstablished?"0x"+unchecked((uint)writer.ExitCode).ToString("X8"):null,viewsReleased=writerExitEstablished&&writer.ExitCode==0});
        }
        Require(writerExitEstablished&&writerStop!.Errors.Length==0,"Mapped writer teardown did not complete normally; fixture retained.");
        Require(writer.ExitCode==0,"Mapped writer exited abnormally; mapped persistence is unverified.");
    }
    Require(exactOverlap,"No retained mapping force-lock busy response was observed.");
    }
    if(mounted)await SettleDetach("after-workload");
    Require(!mounted,"Owned mount did not detach after workload stopped.");
    await Unlock();await Mount();mountedRoot=drive+"\\";
    Require(File.ReadAllBytes(Path.Combine(mountedRoot,"idle.bin")).SequenceEqual(new byte[]{1,2,3,4}),"Authenticated reopen lost idle bytes.");
    if(!ordinaryOnly)MappedWriter.Verify(Path.Combine(mountedRoot,"mapped.bin"));
    checks.Add(new{name="authenticated-reopen-after-all-views-release",verified=true});
    if(mounted)await SettleDetach("after-authenticated-reopen");
    Require(!mounted,"Reopened synthetic mount did not detach.");finished=ordinaryOnly||exactOverlap;
}
catch(Exception error){originalException??=error.GetType().Name+": "+error.Message;checks.Add(new{name="run-error",verified=false,type=error.GetType().Name,message=error.Message});}
finally
{
    password="";
    bool driveAbsent=false;bool teardownFailed=false;
    try
    {
        try { await PersistProgress(); } catch(Exception error) { teardownFailed=true;checks.Add(new{name="pre-teardown-receipt-error",verified=false,type=error.GetType().Name}); }
        if(helper!=null)
        {
            helperDisposition=await MountedTeardown.Run(writerExitEstablished,()=>protocolOutcomeUnknown||helper.OutcomeUnknown,async()=>{
                if(mounted){var locked=await helper.Call("forceLock",new{});checks.Add(new{name="teardown-force-lock-response",response=locked});mounted=!locked.GetProperty("locked").GetBoolean();}
            },async()=>{
                var helperStop=await helper.Stop();
                if(!helperStop.ExitEstablished||helperStop.Errors.Length!=0)teardownFailed=true;
                checks.Add(new{name="helper-stop",verified=helperStop.ExitEstablished&&helperStop.Errors.Length==0,helperStop});
            });
            if(helperDisposition.Retained||helperDisposition.Errors.Length!=0)teardownFailed=true;
            checks.Add(new{name="helper-disposition",verified=!helperDisposition.Retained,helperDisposition,writerId,writerStartedUtc});
        }
        driveAbsent=drive is null||!Directory.Exists(drive+"\\");
        if(writerExitEstablished&&!teardownFailed&&!mounted&&driveAbsent){FixtureCleanup.DeleteOwned(root);FixtureCleanup.DeleteOwned(history);cleanup=!Directory.Exists(root)&&!Directory.Exists(history);}
    }
    catch(Exception error){teardownFailed=true;checks.Add(new{name="teardown-error",verified=false,type=error.GetType().Name,message=error.Message});}
    finally
    {
        bool complete=finished&&cleanup&&!teardownFailed&&writerExitEstablished;
        string? helperSha256=null;
        try{helperSha256=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(executable)));}catch(Exception error){complete=false;checks.Add(new{name="helper-hash-error",verified=false,type=error.GetType().Name});}
        using var runnerIdentity=Process.GetCurrentProcess();
        var runner=new{pid=runnerIdentity.Id,startedUtc=runnerIdentity.StartTime.ToUniversalTime(),executable=runnerIdentity.MainModule?.FileName};
        var report=new{schemaVersion=1,runner,sourceCommit,helperSha256,admittedHelperSha256,route="native-helper-protocol-and-win32-mapped-io",guiUsed=false,originalException,checks,teardown=new{mounted,mountState=(protocolOutcomeUnknown||helper?.OutcomeUnknown==true)?"unknown":"last-confirmed",driveAbsent,protocolOutcomeUnknown=protocolOutcomeUnknown||helper?.OutcomeUnknown==true,helperDisposition,ownedFixtureRemoved=cleanup,helperId=helper?.ProcessId,helperStartedUtc=helper?.StartedUtc,helperExecutable=executable,runnerHoldRequired=helperDisposition?.Retained==true,recoveryDisposition=helperDisposition?.Retained==true?"Retain runner, helper, original pipes and fixture for separately reviewed exact-owned recovery; no further detach, stop or deletion.":null,writerId,writerStartedUtc,writerExitEstablished,writerStop},complete};
        string reportJson=JsonSerializer.Serialize(report,new JsonSerializerOptions{WriteIndented=true});
        try{await File.WriteAllTextAsync(output,reportJson);}finally{
            Console.WriteLine(reportJson);Environment.ExitCode=complete?0:2;
            if(helperDisposition?.Retained==true&&helper is not null)
            {
                int holdReceipt=0;
                await RetainedRunnerHold.Run(helper.OwnedExit(),helper.OriginalOutcome,async(state,response)=>{
                    string retainedJson=JsonSerializer.Serialize(new{schemaVersion=1,runner,helperId=helper.ProcessId,helperStartedUtc=helper.StartedUtc,helperExecutable=executable,fixture=root,state,response,atUtc=DateTimeOffset.UtcNow,complete=false,acceptance="incomplete",recovery="Separate exact-owned review required; no detach, stop or deletion issued."},new JsonSerializerOptions{WriteIndented=true});
                    // A receipt failure never converts retention into implicit EOF.
                    try{await File.WriteAllTextAsync(output+".hold-"+(++holdReceipt)+".json",retainedJson);}catch(Exception error){Console.Error.WriteLine("Retention receipt write failed: "+error.GetType().Name);}
                });
            }
        }
    }
}

sealed class MountedHelper:IAsyncDisposable
{
    readonly Process process;readonly ConcurrentDictionary<long,TaskCompletionSource<JsonElement>> pending=new();readonly Task reader;long sequence;
    internal Task<JsonElement>? OriginalOutcome { get; private set; }
    internal Task OwnedExit()=>process.WaitForExitAsync();
    internal bool OutcomeUnknown { get; private set; }
    internal int ProcessId { get; private set; }
    internal DateTime StartedUtc { get; private set; }
    internal MountedHelper(string executable,string expectedSha256){HelperAdmission.Verify(executable,expectedSha256);process=Process.Start(new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true})!;ProcessId=process.Id;StartedUtc=process.StartTime.ToUniversalTime();_=process.StandardError.ReadToEndAsync();reader=Task.Run(async()=>{string? line;while((line=await process.StandardOutput.ReadLineAsync())!=null){using var document=JsonDocument.Parse(line);if(!document.RootElement.TryGetProperty("id",out var id)||id.ValueKind!=JsonValueKind.Number)continue;if(pending.TryRemove(id.GetInt64(),out var completion)){if(document.RootElement.TryGetProperty("error",out var error))completion.TrySetException(new IOException(error.GetString()));else completion.TrySetResult(document.RootElement.GetProperty("result").Clone());}}});}
    internal async Task<JsonElement> Call(string method,object parameters,TimeSpan? timeout=null)
    {
        if(OutcomeUnknown)throw new InvalidOperationException("Original protocol outcome is unknown; further requests are prohibited.");
        long id=Interlocked.Increment(ref sequence);var completion=new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);pending[id]=completion;OriginalOutcome=completion.Task;
        try{await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new{id,method,@params=parameters}));await process.StandardInput.FlushAsync();return await completion.Task.WaitAsync(timeout??TimeSpan.FromSeconds(20));}
        catch{OutcomeUnknown=true;throw;}
    }

    internal async Task<ProcessStopResult> Stop()
    {
        var result=await BoundedProcessStop.Run(process,()=>process.StandardInput.Close());
        if(!result.ExitEstablished)return result;
        try{await reader.WaitAsync(TimeSpan.FromSeconds(5));}
        catch(Exception error){result=result with{Errors=result.Errors.Append("reader:"+error.GetType().Name).ToArray()};}
        process.Dispose();return result;
    }
    public async ValueTask DisposeAsync(){await Stop();}
}
