using System.Collections.Concurrent;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using MaterialFileEncryptor.Core;

if(args.Length==1 && args[0]=="--cleanup-check"){FixtureCleanup.Check();return;}
if(args.Length==2 && args[0]=="--core-crash"){CoreBenchmark.CrashChild(args[1]);return;}
if(args.Length!=2)throw new ArgumentException("Supply the built native host path and an output JSON path.");
string host=Path.GetFullPath(args[0]),output=Path.GetFullPath(args[1]);
if(!File.Exists(host))throw new FileNotFoundException("Build the native host first.");
string root=Path.Combine(Path.GetTempPath(),"mfe-performance-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
string source=Path.Combine(root,"source"),cache=Path.Combine(root,"cache");
string historyName=Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(source.ToUpperInvariant()+"|folder|"))).ToLowerInvariant();
string historyRoot=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"MaterialFileEncryptor-Data","History",historyName);
if(Directory.Exists(historyRoot))throw new InvalidOperationException("Synthetic history destination unexpectedly exists.");
Directory.CreateDirectory(Path.GetDirectoryName(output)!);
await File.WriteAllTextAsync(output+".fixture.json",JsonSerializer.Serialize(new{root,historyRoot},new JsonSerializerOptions{WriteIndented=true}));
try
{
    using(var credentials=VaultCredentials.Password("performance fixture only"))using(var vault=VaultEngine.Create(new VaultOptions{StorageRoot=source,CacheRoot=cache},credentials)){}
    await using var helper=new Helper(host);
    await helper.Call("unlock",new{storageDir=source,cacheDir=cache,password="performance fixture only"});
    await Task.Delay(3000);
    helper.Process.Refresh();TimeSpan idleBefore=helper.Process.TotalProcessorTime;var idleWatch=Stopwatch.StartNew();
    await Task.Delay(TimeSpan.FromSeconds(60));
    helper.Process.Refresh();double idleCpuMs=(helper.Process.TotalProcessorTime-idleBefore).TotalMilliseconds,idleElapsedMs=idleWatch.Elapsed.TotalMilliseconds;
    int cpuCount=Environment.ProcessorCount;double idleCapacityPercent=100*idleCpuMs/(idleElapsedMs*cpuCount);
    string input=Path.Combine(root,"synthetic.bin");
    await using(var stream=new FileStream(input,FileMode.CreateNew,FileAccess.Write,FileShare.None,65536,FileOptions.Asynchronous))
    {byte[] block=new byte[65536];RandomNumberGenerator.Fill(block);for(int i=0;i<4096;++i)await stream.WriteAsync(block);CryptographicOperations.ZeroMemory(block);}
    long peakWorking=0,peakPrivate=0;using var monitorStop=new CancellationTokenSource();
    var monitor=Task.Run(async()=>{while(!monitorStop.IsCancellationRequested){helper.Process.Refresh();peakWorking=Math.Max(peakWorking,helper.Process.WorkingSet64);peakPrivate=Math.Max(peakPrivate,helper.Process.PrivateMemorySize64);try{await Task.Delay(20,monitorStop.Token);}catch(OperationCanceledException){break;}}});
    var start=await helper.Call("startImport",new{paths=new[]{input}});string operation=start.GetProperty("operationId").GetString()!;
    var latencies=new List<double>();int runningSamples=0;
    for(int index=0;index<30;++index)
    {
        var watch=Stopwatch.StartNew();await helper.Call("status",new{});latencies.Add(watch.Elapsed.TotalMilliseconds);
        var operations=await helper.Call("operations",new{});
        if(operations.EnumerateArray().Any(item=>item.GetProperty("operationId").GetString()==operation&&item.GetProperty("state").GetString()=="running"))runningSamples++;
        await Task.Delay(10);
    }
    var cancelWatch=Stopwatch.StartNew();var cancel=await helper.Call("cancelOperation",new{operationId=operation});double cancelMs=cancelWatch.Elapsed.TotalMilliseconds;
    string terminal="";var stopWatch=Stopwatch.StartNew();
    while(stopWatch.Elapsed<TimeSpan.FromSeconds(30))
    {
        var operations=await helper.Call("operations",new{});terminal=operations.EnumerateArray().Single(item=>item.GetProperty("operationId").GetString()==operation).GetProperty("state").GetString()!;
        if(terminal is "cancelled" or "completed" or "failed")break;await Task.Delay(20);
    }
    monitorStop.Cancel();await monitor;
    latencies.Sort();
    bool acknowledgementPassed=runningSamples>0&&latencies.Max()<=250&&cancelMs<=250;
    await helper.Call("lock",new{});
    var core=CoreBenchmark.Run(Path.Combine(root,"core"));
    var report=new
    {
        schemaVersion=1,recordedUtc=DateTimeOffset.UtcNow,route="synthetic-native-helper-protocol",hostSha256=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(host))),
        idle=new{durationMilliseconds=idleElapsedMs,cpuMilliseconds=idleCpuMs,logicalProcessorCount=cpuCount,totalMachineCapacityPercent=idleCapacityPercent},
        load=new{inputBytes=new FileInfo(input).Length,statusSamples=latencies.Count,runningSamples,statusP50Milliseconds=latencies[latencies.Count/2],statusP95Milliseconds=latencies[(int)Math.Floor((latencies.Count-1)*0.95)],statusMaxMilliseconds=latencies.Max(),cancelAcknowledgementMilliseconds=cancelMs,cancelAccepted=cancel.GetProperty("accepted").GetBoolean(),terminalState=terminal,cancelToTerminalMilliseconds=stopWatch.Elapsed.TotalMilliseconds,acknowledgementBudgetMilliseconds=250,acknowledgementPassed,peakSampledWorkingSetBytes=peakWorking,peakSampledPrivateBytes=peakPrivate},
        memory=new{helperManagedAllocatedBytes=(long?)null,helperManagedAllocatedBytesReason="External process allocation instrumentation is not enabled. Working-set measurements are actual process samples.",plaintextImportBufferLimitBytes=65536,admittedRequestMetadataBudgetBytes=64L*1024*1024-65536,queueBudgetSource="VaultController.Transfers.MaximumQueuedBytes; TransferOperationRegistry.Outstanding max64; source contract, not external heap instrumentation"},
        core,
        boundaries=new[]{"Synthetic files only; no mounted drive or user vault.","CPU percentage is normalized by logical processors and covers this helper only, not whole-computer satisfaction.","Status acknowledgement is not renderer input latency.","Core allocation metric is in-process and does not claim helper allocation totals."}
    };
    Directory.CreateDirectory(Path.GetDirectoryName(output)!);await File.WriteAllTextAsync(output,JsonSerializer.Serialize(report,new JsonSerializerOptions{WriteIndented=true}));
    Console.WriteLine($"Idle helper CPU {idleCapacityPercent:F4}% total-machine capacity over {idleElapsedMs/1000:F2}s; cores={cpuCount}");
    Console.WriteLine($"Status max {latencies.Max():F2}ms; cancel acknowledgement {cancelMs:F2}ms; terminal={terminal}; running samples={runningSamples}");
    Console.WriteLine($"Peak sampled working set {peakWorking} bytes; private {peakPrivate} bytes");
    Console.WriteLine($"Core allocated {core.AllocatedBytes} bytes; small edit ciphertext {core.AddedCiphertextBytes} bytes; durable={core.DurabilityPassed}");
    if(!acknowledgementPassed||!core.DurabilityPassed)Environment.ExitCode=1;
}
finally
{
    FixtureCleanup.DeleteOwned(root);
    FixtureCleanup.DeleteOwned(historyRoot);
}

sealed class Helper:IAsyncDisposable
{
    internal Process Process{get;}
    readonly ConcurrentDictionary<long,TaskCompletionSource<JsonElement>> pending=new();readonly Task reader;long next;
    internal Helper(string executable)
    {
        Process=Process.Start(new ProcessStartInfo(executable){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true})!;
        _=Process.StandardError.ReadToEndAsync();
        reader=Task.Run(async()=>{string? line;while((line=await Process.StandardOutput.ReadLineAsync())!=null){using var json=JsonDocument.Parse(line);if(!json.RootElement.TryGetProperty("id",out var id)||id.ValueKind!=JsonValueKind.Number)continue;if(pending.TryRemove(id.GetInt64(),out var completion)){if(json.RootElement.TryGetProperty("error",out var error))completion.TrySetException(new InvalidOperationException(error.GetString()));else completion.TrySetResult(json.RootElement.GetProperty("result").Clone());}}});
    }
    internal async Task<JsonElement> Call(string method,object parameters)
    {
        long id=Interlocked.Increment(ref next);var completion=new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);pending[id]=completion;
        await Process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(new{id,method,@params=parameters}));await Process.StandardInput.FlushAsync();
        return await completion.Task.WaitAsync(TimeSpan.FromSeconds(30));
    }
    public async ValueTask DisposeAsync()
    {
        Process.StandardInput.Close();
        using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(30));
        try{await Process.WaitForExitAsync(timeout.Token);}catch(OperationCanceledException){if(!Process.HasExited)Process.Kill(true);await Process.WaitForExitAsync();}
        await reader;Process.Dispose();
    }
}
