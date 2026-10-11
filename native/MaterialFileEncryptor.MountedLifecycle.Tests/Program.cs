using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.MemoryMappedFiles;
using System.Security.Cryptography;
using System.Text.Json;

if(args.Length!=3)throw new ArgumentException("Supply package root, output JSON and exact source commit.");
string package=Path.GetFullPath(args[0]),output=Path.GetFullPath(args[1]),sourceCommit=args[2];
if(sourceCommit.Length!=40||!sourceCommit.All(Uri.IsHexDigit))throw new ArgumentException("A full source commit is required.");
string executable=Path.Combine(package,"resources","native","MaterialFileEncryptor.Host.exe");
if(!File.Exists(executable))throw new FileNotFoundException("Packaged native helper is missing.");
string root=Path.Combine(Path.GetTempPath(),"mfe-mounted-lifecycle-"+Guid.NewGuid().ToString("N"));
string storage=Path.Combine(root,"storage"),cache=Path.Combine(root,"cache");Directory.CreateDirectory(root);
string historyName=Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(storage.ToUpperInvariant()+"|folder|"))).ToLowerInvariant();
string history=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MaterialFileEncryptor-Data","History",historyName);
if(Directory.Exists(history))throw new InvalidOperationException("Synthetic history destination already exists.");
Directory.CreateDirectory(Path.GetDirectoryName(output)!);await File.WriteAllTextAsync(output+".fixture.json",JsonSerializer.Serialize(new{root,storage,cache,history,executable},new JsonSerializerOptions{WriteIndented=true}));
string password=Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
var checks=new List<object>();string? drive=null;bool mounted=false,finished=false,cleanup=false;MountedHelper? helper=null;
void Require(bool condition,string message){if(!condition)throw new InvalidOperationException(message);}
async Task Mount()
{
    var status=await helper!.Call("status",new{});
    var available=status.GetProperty("availableDriveLetters").EnumerateArray().Select(value=>value.GetString()!).ToArray();
    drive=available.LastOrDefault()??throw new InvalidOperationException("No unused drive letter is available.");
    Require(!DriveInfo.GetDrives().Any(value=>value.Name.StartsWith(drive,StringComparison.OrdinalIgnoreCase)),"Selected drive became occupied.");
    var result=await helper.Call("mount",new{driveLetter=drive});Require(result.GetProperty("mounted").GetBoolean(),"Synthetic mount did not complete.");mounted=true;
}
async Task Unlock()=>await helper!.Call("unlock",new{storageDir=storage,cacheDir=cache,password,partSizeBytes=1048576});
try
{
    helper=new MountedHelper(executable);
    var status=await helper.Call("status",new{});Require(status.GetProperty("driver").GetProperty("available").GetBoolean(),"WinFsp is unavailable.");
    await helper.Call("create",new{storageDir=storage,cacheDir=cache,password,partSizeBytes=1048576});await Mount();
    string mountedRoot=drive+"\\";
    string idleFile=Path.Combine(mountedRoot,"idle.bin");File.WriteAllBytes(idleFile,new byte[]{1,2,3,4});
    using(var idle=new FileStream(idleFile,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
    {
        var result=await helper.Call("forceLock",new{});bool locked=result.GetProperty("locked").GetBoolean();
        Require(locked&&!result.GetProperty("busy").GetBoolean(),"Idle open handle prevented force lock.");mounted=false;
        Require(!Directory.Exists(mountedRoot),"Owned drive remained visible after force lock.");
        checks.Add(new{name="idle-open-handle-force-lock",verified=true,locked,driveAbsent=true});
    }
    await Unlock();await Mount();mountedRoot=drive+"\\";
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

    string mappedFile=Path.Combine(mountedRoot,"mapped.bin");
    using(var seed=new FileStream(mappedFile,FileMode.CreateNew,FileAccess.Write,FileShare.ReadWrite)){seed.SetLength(64L*1024*1024);seed.Flush(true);}
    bool exactOverlap=false,concurrentBusy=false;JsonElement last=default;Exception? writerFailure=null;
    using(var file=new FileStream(mappedFile,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite|FileShare.Delete))
    using(var mapping=MemoryMappedFile.CreateFromFile(file,null,0,MemoryMappedFileAccess.ReadWrite,HandleInheritability.None,true))
    using(var view=mapping.CreateViewAccessor())
    using(var stop=new CancellationTokenSource())
    {
        var started=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var writer=Task.Run(()=>{try{byte[] block=new byte[65536];RandomNumberGenerator.Fill(block);started.TrySetResult();while(!stop.IsCancellationRequested){for(long offset=0;offset<64L*1024*1024&&!stop.IsCancellationRequested;offset+=block.Length)view.WriteArray(offset,block,0,block.Length);view.Flush();}CryptographicOperations.ZeroMemory(block);}catch(Exception error){writerFailure=error;}});
        await started.Task;await Task.Delay(25);
        for(int attempt=0;attempt<3&&!exactOverlap;attempt++)
        {
            last=await helper.Call("forceLock",new{});
            bool busy=last.TryGetProperty("busy",out var flag)&&flag.GetBoolean();concurrentBusy|=busy;
            exactOverlap=busy&&last.TryGetProperty("activeFilesystemIo",out var active)&&active.GetInt32()>0;
            if(last.GetProperty("locked").GetBoolean()){mounted=false;break;}
            await Task.Delay(10);
        }
        stop.Cancel();await writer.WaitAsync(TimeSpan.FromSeconds(10));
    }
    checks.Add(new{name="active-mapped-io-force-lock",verified=exactOverlap,concurrentBusyObserved=concurrentBusy,exactActiveIoOverlap=exactOverlap,verdict=exactOverlap?"passed":"unverified",reason=exactOverlap?null:"No response proved a nonzero activeFilesystemIo counter while mapped I/O was active.",writerFailure=writerFailure?.GetType().Name});
    if(mounted){for(int attempt=0;attempt<10;attempt++){var result=await helper.Call("forceLock",new{});if(result.GetProperty("locked").GetBoolean()){mounted=false;break;}await Task.Delay(100);}}
    Require(!mounted,"Owned mount did not detach after workload stopped.");finished=exactOverlap;
}
catch(Exception error){checks.Add(new{name="run-error",verified=false,type=error.GetType().Name,message=error.Message});}
finally
{
    password="";
    if(helper!=null)
    {
        try{if(mounted){var locked=await helper.Call("forceLock",new{});mounted=!locked.GetProperty("locked").GetBoolean();}}catch{}
        await helper.DisposeAsync();
    }
    bool driveAbsent=drive is null||!Directory.Exists(drive+"\\");
    if(!mounted&&driveAbsent){FixtureCleanup.DeleteOwned(root);FixtureCleanup.DeleteOwned(history);cleanup=!Directory.Exists(root)&&!Directory.Exists(history);}
    var report=new{schemaVersion=1,sourceCommit,helperSha256=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(executable))),route="native-helper-protocol-and-win32-mapped-io",guiUsed=false,checks,teardown=new{mounted,driveAbsent,ownedFixtureRemoved=cleanup},complete=finished&&cleanup};
    await File.WriteAllTextAsync(output,JsonSerializer.Serialize(report,new JsonSerializerOptions{WriteIndented=true}));
    Console.WriteLine(JsonSerializer.Serialize(report));
    Environment.ExitCode=finished&&cleanup?0:2;
}

sealed class MountedHelper:IAsyncDisposable
{
    readonly Process process;readonly ConcurrentDictionary<long,TaskCompletionSource<JsonElement>> pending=new();readonly Task reader;long sequence;
    internal MountedHelper(string executable){process=Process.Start(new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true})!;_=process.StandardError.ReadToEndAsync();reader=Task.Run(async()=>{string? line;while((line=await process.StandardOutput.ReadLineAsync())!=null){using var document=JsonDocument.Parse(line);if(!document.RootElement.TryGetProperty("id",out var id)||id.ValueKind!=JsonValueKind.Number)continue;if(pending.TryRemove(id.GetInt64(),out var completion)){if(document.RootElement.TryGetProperty("error",out var error))completion.TrySetException(new IOException(error.GetString()));else completion.TrySetResult(document.RootElement.GetProperty("result").Clone());}}});}
    internal async Task<JsonElement> Call(string method,object parameters){long id=Interlocked.Increment(ref sequence);var completion=new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);pending[id]=completion;await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new{id,method,@params=parameters}));await process.StandardInput.FlushAsync();return await completion.Task.WaitAsync(TimeSpan.FromSeconds(20));}
    public async ValueTask DisposeAsync(){process.StandardInput.Close();using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(15));try{await process.WaitForExitAsync(timeout.Token);}catch(OperationCanceledException){if(!process.HasExited)process.Kill(true);await process.WaitForExitAsync();}await reader;process.Dispose();}
}
