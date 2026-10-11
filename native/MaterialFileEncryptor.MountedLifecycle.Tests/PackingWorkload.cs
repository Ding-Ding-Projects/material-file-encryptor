using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;

internal static class PackingWorkload
{
    internal const long Cap=83886080;
    private const string Name="physical-packing.bin";
    internal sealed record Result(long Length,string Sha256,int Parts,long PeakObservedPrivateBytes,long PeakWorkingSetBytes);
    private static void Require(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    internal static async Task<Result> Run(string mountedRoot,int helperId,Func<string,object,Task<JsonElement>> call,List<object> checks,Func<Task> persist,Action<Task> trackIo)
    {
        Require(!mountedRoot.StartsWith("M:",StringComparison.OrdinalIgnoreCase),"The live drive is excluded from synthetic packing checks.");
        long length=2*Cap+123456,offset=0;
        byte[] buffer=Enumerable.Range(0,1024*1024).Select(i=>(byte)((i*31)%251)).ToArray();
        using var expected=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        using var helper=Process.GetProcessById(helperId);helper.Refresh();long peakPrivate=helper.PrivateMemorySize64;
        var file=Path.Combine(mountedRoot,Name);
        using(var first=new FileStream(file,FileMode.CreateNew,FileAccess.ReadWrite,FileShare.ReadWrite|FileShare.Delete,65536,FileOptions.WriteThrough))
        using(var second=new FileStream(file,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite|FileShare.Delete))
        {
            while(offset<length)
            {
                int count=(int)Math.Min(offset<Cap?65536:buffer.Length,length-offset);
                first.Write(buffer,0,count);expected.AppendData(buffer,0,count);offset+=count;
                if(offset%(16*1024*1024)==0){helper.Refresh();peakPrivate=Math.Max(peakPrivate,helper.PrivateMemorySize64);}
            }
            first.Flush(true);
            var active=await call("storageDiagnostics",new{});
            Require(active.GetProperty("activeWriters").GetInt32()>=2,"Two writable descriptors were not tracked.");
            checks.Add(new{name="packing-two-writer-admission",verified=true,activeWriters=active.GetProperty("activeWriters").GetInt32(),length});await persist();
            var deferred=await call("startPacking",new{path=Name,partSizeBytes=Cap});
            await WaitOperation(deferred.GetProperty("operationId").GetString()!,false);
            var pending=await call("storageDiagnostics",new{});
            Require(pending.GetProperty("pendingPackingFiles").GetInt32()>0,"Packing adopted while writers were retained.");
            first.Dispose();
            var retained=await call("storageDiagnostics",new{});
            Require(retained.GetProperty("activeWriters").GetInt32()>=1&&retained.GetProperty("pendingPackingFiles").GetInt32()>0,"First close released the remaining writer.");
            checks.Add(new{name="packing-first-close-retains-second-writer",verified=true});await persist();
        }
        string digest=Convert.ToHexString(expected.GetHashAndReset());
        var started=await call("startPacking",new{partSizeBytes=Cap});
        await WaitOperation(started.GetProperty("operationId").GetString()!,true);
        var files=await call("listFiles",new{limit=1000});
        var entry=files.GetProperty("items").EnumerateArray().Single(item=>item.GetProperty("path").GetString()==Name);
        Require(entry.GetProperty("partSizeBytes").GetInt64()==Cap&&entry.GetProperty("partCount").GetInt32()==3,"Dense mounted file did not reach three 80 MiB physical parts.");
        Require(Hash(file)==digest,"Packing changed mounted plaintext bytes.");
        var status=await call("status",new{});var budget=status.GetProperty("transferBuffers");
        Require(budget.GetProperty("PeakReservedBytes").GetInt64()<=budget.GetProperty("LimitBytes").GetInt64(),"Native transfer reservation exceeded its configured bound.");
        helper.Refresh();peakPrivate=Math.Max(peakPrivate,helper.PrivateMemorySize64);
        var result=new Result(length,digest,entry.GetProperty("partCount").GetInt32(),peakPrivate,helper.PeakWorkingSet64);
        checks.Add(new{name="mounted-physical-packing",verified=true,logicalBytes=length,partSizeBytes=Cap,partCount=result.Parts,sha256=digest,peakObservedPrivateBytes=peakPrivate,peakWorkingSetBytes=result.PeakWorkingSetBytes,bufferBudget=budget});await persist();
        CryptographicOperations.ZeroMemory(buffer);return result;

        async Task WaitOperation(string id,bool exerciseUnrelated)
        {
            var deadline=Stopwatch.StartNew();var observed=new HashSet<string>();
            while(deadline.Elapsed<TimeSpan.FromMinutes(3))
            {
                var response=await call("operations",new{});var row=response.EnumerateArray().Single(item=>item.GetProperty("operationId").GetString()==id);
                string state=row.GetProperty("state").GetString()!,phase=row.GetProperty("phase").GetString()!;
                if(exerciseUnrelated&&state=="running"&&observed.Add(phase))
                {
                    var statusWatch=Stopwatch.StartNew();await call("statusSummary",new{});double statusMs=statusWatch.Elapsed.TotalMilliseconds;
                    var ioWatch=Stopwatch.StartNew();string other=Path.Combine(mountedRoot,"packing-independent.bin");
                    var io=Task.Run(()=>{File.WriteAllBytes(other,new byte[]{4,2});Require(File.ReadAllBytes(other).SequenceEqual(new byte[]{4,2}),"Independent mounted read changed bytes.");_=Directory.GetFiles(mountedRoot);});
                    trackIo(io);await io.WaitAsync(TimeSpan.FromSeconds(10));
                    double ioMs=ioWatch.Elapsed.TotalMilliseconds;
                    Require(statusMs<5000&&ioMs<5000,"Packing blocked unrelated mounted I/O or status beyond five seconds.");
                    helper.Refresh();peakPrivate=Math.Max(peakPrivate,helper.PrivateMemorySize64);
                    checks.Add(new{name="packing-independent-mounted-response",verified=true,phase,statusMilliseconds=statusMs,ioMilliseconds=ioMs});await persist();
                }
                if(state=="completed")return;
                if(state is "failed" or "cancelled")throw new IOException("Synthetic packing operation did not complete: "+state);
                await Task.Delay(250);
            }
            throw new TimeoutException("Synthetic packing exceeded its three-minute bound.");
        }
    }
    private static string Hash(string path){using var stream=File.OpenRead(path);return Convert.ToHexString(SHA256.HashData(stream));}
    internal static void VerifyReopened(string mountedRoot,Result expected)
    {var file=Path.Combine(mountedRoot,Name);Require(new FileInfo(file).Length==expected.Length&&Hash(file)==expected.Sha256,"Authenticated mounted reopen changed packed bytes.");}
}
