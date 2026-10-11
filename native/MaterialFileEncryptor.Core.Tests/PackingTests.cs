using MaterialFileEncryptor.Core;
using System.Security.Cryptography;

internal static class PackingTests
{
    private sealed class Fixture:IDisposable
    {
        internal readonly string Root=Path.Combine(Path.GetTempPath(),"mfe-packing-"+Guid.NewGuid().ToString("N"));
        internal VaultOptions Options(long cap=83886080)=>new(){StorageRoot=Path.Combine(Root,"source"),CacheRoot=Path.Combine(Root,"cache"),PartSizeBytes=cap};
        internal VaultCredentials Credentials()=>VaultCredentials.KeyFile(Enumerable.Range(0,32).Select(i=>(byte)i).ToArray());
        internal VaultEngine Create(long cap=83886080){using var c=Credentials();return VaultEngine.Create(Options(cap),c);}
        internal VaultEngine Open(){using var c=Credentials();return VaultEngine.Open(Options(),c);}
        public void Dispose(){if(Directory.Exists(Root))Directory.Delete(Root,true);}
    }
    private static void Assert(bool value,string message){if(!value)throw new Exception(message);}
    private static byte[] Data(int size,int seed=0)=>Enumerable.Range(0,size).Select(i=>(byte)((i*31+seed)%251)).ToArray();
    private static byte[] Read(VaultEngine engine,string path)
    {var bytes=new byte[checked((int)engine.GetInfo(path)!.Length)];Assert(engine.ReadRange(path,0,bytes)==bytes.Length,"Short read");return bytes;}
    internal static void Races()
    {
        using var fixture=new Fixture();using var engine=fixture.Create(1024*1024);
        engine.CreateFile("data");var bytes=Data(300000);engine.WriteRange("data",0,bytes);engine.FlushLocalOnly();
        using(var first=engine.AcquireWriterById(engine.GetInfo("data")!.EntryId))
        using(var second=engine.AcquireWriterById(engine.GetInfo("data")!.EntryId))
        {
            engine.PackAsync("data",2048).GetAwaiter().GetResult();
            Assert(engine.PackingStatus.PendingFiles==1&&engine.GetInfo("data")!.PartSizeBytes==1024*1024,"Packing admitted an active writer");
            first.Dispose();Assert(engine.PackingStatus.ActiveWriters==1,"First close lost retained writer");
        }
        engine.ProcessPackingQueueAsync().GetAwaiter().GetResult();Assert(Read(engine,"data").SequenceEqual(bytes),"Writer-close packing changed content");
        using(var held=engine.AcquireWriterById(engine.GetInfo("data")!.EntryId))
        {
            engine.PackAsync("data",8192).GetAwaiter().GetResult();
            engine.PackAsync("data",2048).GetAwaiter().GetResult();
        }
        engine.ProcessPackingQueueAsync().GetAwaiter().GetResult();
        Assert(engine.GetInfo("data")!.PartSizeBytes==2048&&engine.PackingStatus.PendingFiles==0,"Superseded target survived a newer matching-cap request");
        using var snapshot=engine.AcquireReadSnapshot("data");
        engine.PackingTestPoint=point=>{if(point=="packed"){engine.PackingTestPoint=null;engine.WriteRange("data",0,new byte[]{123});engine.FlushLocalOnly();}};
        engine.PackAsync("data",4096).GetAwaiter().GetResult();
        Assert(Read(engine,"data")[0]==123,"Packing overwrote a concurrent write");Assert(engine.PackingStatus.PendingFiles==1,"Race dropped retry queue");
        var snapshotBytes=new byte[bytes.Length];snapshot.ReadRange(0,snapshotBytes);Assert(snapshotBytes.SequenceEqual(bytes),"Export snapshot changed after writes");
        engine.PackingTestPoint=point=>{if(point=="packed"){engine.PackingTestPoint=null;engine.Rename("data","moved");}};
        engine.PackAsync("data",8192).GetAwaiter().GetResult();Assert(engine.GetInfo("data")==null&&engine.GetInfo("moved")!=null,"Packing resurrected renamed path");
        engine.PackingTestPoint=point=>{if(point=="packed"){engine.PackingTestPoint=null;engine.Delete("moved");engine.CreateFile("moved");engine.WriteRange("moved",0,new byte[]{77});}};
        engine.PackAsync("moved",16384).GetAwaiter().GetResult();Assert(Read(engine,"moved").SequenceEqual(new byte[]{77}),"Packing replaced a recreated identity");
    }
    internal static void Durability()
    {
        using var fixture=new Fixture();var bytes=Data(260000);string version;
        using(var engine=fixture.Create(1024*1024))
        {
            engine.CreateFile("data");engine.WriteRange("data",0,bytes);engine.FlushLocalOnly();version=engine.GetInfo("data")!.VersionId;
            engine.PackingTestPoint=point=>{if(point=="before-adoption")throw new IOException("Injected checkpoint fault");};
            try{engine.PackAsync("data",4096).GetAwaiter().GetResult();throw new Exception("Missing checkpoint fault");}catch(IOException){}
            Assert(engine.GetInfo("data")!.VersionId==version&&Read(engine,"data").SequenceEqual(bytes),"Pre-adoption fault changed live data");
            engine.PackingTestPoint=null;
            using var cancellation=new CancellationTokenSource();
            engine.PackingTestPoint=point=>{if(point=="packed")cancellation.Cancel();};
            try{engine.PackAsync("data",4096,cancellation.Token).GetAwaiter().GetResult();throw new Exception("Missing cancellation");}catch(OperationCanceledException){}
            Assert(engine.GetInfo("data")!.VersionId==version,"Cancelled packing adopted");
            engine.PackingTestPoint=point=>{if(point=="adopted")throw new IOException("Injected post-adoption interruption");};
            try{engine.PackAsync("data",4096).GetAwaiter().GetResult();throw new Exception("Missing post-adoption interruption");}catch(IOException){}
            Assert(engine.GetInfo("data")!.PartSizeBytes==4096,"Committed adoption rolled back");
        }
        using(var reopened=fixture.Open())
        {
            Assert(Read(reopened,"data").SequenceEqual(bytes),"Reopen lost durable packed data");
            Assert(reopened.GetInfo("data")!.PartSizeBytes==4096,"Reopen recovered stale map");
            reopened.SetLength("data",777);reopened.SetLength("data",100000);reopened.PackAsync("data",8192).GetAwaiter().GetResult();
            var resized=Read(reopened,"data");Assert(resized.AsSpan(0,777).SequenceEqual(bytes.AsSpan(0,777))&&resized.AsSpan(777).IndexOfAnyExcept((byte)0)<0,"Truncate regrowth exposed stale data");
        }
    }
    internal static void PauseResume()
    {
        using var fixture=new Fixture();string version;
        using(var engine=fixture.Create())
        {
            engine.CreateFile("data");engine.WriteRange("data",0,Data(200000));engine.FlushLocalOnly();version=engine.GetInfo("data")!.VersionId;
            using var cancellation=new CancellationTokenSource();
            engine.PackingTestPoint=point=>{if(point=="packed")cancellation.Cancel();};
            try{engine.PackAsync("data",4096,cancellation.Token).GetAwaiter().GetResult();throw new Exception("Missing cancellation");}catch(OperationCanceledException){}
            Assert(engine.PackingStatus.Paused&&engine.PackingStatus.PendingFiles==1,"Cancellation did not retain a paused request");
        }
        using(var reopened=fixture.Open())
        {
            Assert(reopened.PackingStatus.Paused,"Packing pause did not survive reopen");
            reopened.ProcessPackingQueueAsync().GetAwaiter().GetResult();
            Assert(reopened.GetInfo("data")!.VersionId==version,"Automatic work resumed a cancelled migration");
            reopened.PackAsync("data",4096).GetAwaiter().GetResult();
            Assert(!reopened.PackingStatus.Paused&&reopened.PackingStatus.PendingFiles==0,"Explicit resume did not finish queued work");
        }
    }
    internal static void Publication()
    {
        using var fixture=new Fixture();using var engine=fixture.Create();engine.CreateFile("first");engine.WriteRange("first",0,Data(200000));engine.FlushLocalOnly();
        using var entered=new ManualResetEventSlim();using var release=new ManualResetEventSlim();
        engine.PublicationTestPoint=point=>{if(point=="part"){entered.Set();if(!release.Wait(TimeSpan.FromSeconds(10)))throw new TimeoutException();}};
        var publisher=Task.Run(()=>engine.FlushAsync());
        Assert(entered.Wait(TimeSpan.FromSeconds(5)),"Publication never entered controlled stall");
        try
        {
            var write=Task.Run(()=>{engine.CreateFile("other");engine.WriteRange("other",0,new byte[]{42});engine.FlushLocalOnly();return engine.Status;});
            Assert(write.Wait(TimeSpan.FromSeconds(2)),"Slow publication starved unrelated writes/status");
        }
        finally{release.Set();publisher.GetAwaiter().GetResult();engine.PublicationTestPoint=null;}
        Assert(Read(engine,"other").SequenceEqual(new byte[]{42}),"Publication acknowledgement lost new mutation");
        engine.PublicationTestPoint=point=>{if(point=="published")throw new IOException("Injected acknowledgement interruption");};
        engine.FlushAsync().GetAwaiter().GetResult();Assert(engine.Status.PendingCommits>0,"Published-but-unacknowledged item lost retry state");
        engine.PublicationTestPoint=null;engine.FlushAsync().GetAwaiter().GetResult();Assert(engine.Status.PendingCommits==0,"Idempotent retry did not acknowledge exact pending item");
        using var observer=VaultEngine.Open(new VaultOptions{StorageRoot=fixture.Options().StorageRoot,CacheRoot=Path.Combine(fixture.Root,"observer")},fixture.Credentials());
        Assert(Read(observer,"other").SequenceEqual(new byte[]{42}),"Published metadata lost concurrent file");
    }
    internal static void Dense()
    {
        const long cap=83886080;const int block=65536;long length=cap*2+123456;
        using var fixture=new Fixture();using var engine=fixture.Create();Assert(engine.PartSizeBytes==cap,"Incorrect default cap");
        engine.CreateFile("large");var buffer=Data(1024*1024);long offset=0;
        using var expected=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        while(offset<length)
        {
            int count=(int)Math.Min(offset<cap?block:buffer.Length,length-offset);
            engine.WriteRange("large",offset,buffer.AsSpan(0,count));engine.FlushLocalOnly();expected.AppendData(buffer,0,count);offset+=count;
        }
        var digest=expected.GetHashAndReset();int before=engine.GetInfo("large")!.PartCount;
        var memoryBefore=GC.GetTotalMemory(true);engine.PackAsync().GetAwaiter().GetResult();var memoryAfter=GC.GetTotalMemory(true);
        var info=engine.GetInfo("large")!;Assert(info.PartCount==3&&before>info.PartCount,"Dense file was not packed into near-cap parts");
        var diagnostics=engine.GetStorageDiagnostics();Assert(diagnostics.HistoricalOnlyParts>=before,"Pending retained history is absent from diagnostics");Assert(diagnostics.CurrentReferencedBytes<=cap*3&&diagnostics.CurrentReferencedBytes>length,"Physical bytes do not include encryption overhead");
        using var actual=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        for(offset=0;offset<length;){int count=engine.ReadRange("large",offset,buffer);actual.AppendData(buffer,0,count);offset+=count;}
        Assert(actual.GetHashAndReset().SequenceEqual(digest),"Dense packing changed plaintext hash");
        Assert(memoryAfter-memoryBefore<32L*1024*1024,"Packing retained an oversized plaintext allocation");
        engine.FlushAsync().GetAwaiter().GetResult();engine.EvictCache(long.MaxValue);
        using var snapshot=engine.AcquireReadSnapshot("large");var tail=new byte[1234];snapshot.ReadRange(length-tail.Length,tail);
        Console.WriteLine($"Packing evidence: logicalBytes={length}, currentParts={info.PartCount}, priorParts={before}, physicalBytes={diagnostics.CurrentReferencedBytes}, retainedManagedBytesDelta={memoryAfter-memoryBefore}");
    }
}
