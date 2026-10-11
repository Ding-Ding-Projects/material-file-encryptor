using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using MaterialFileEncryptor.Core;

static class Regression
{
    static readonly Type ControllerType = Assembly.Load("MaterialFileEncryptor.Host").GetType("MaterialFileEncryptor.Host.VaultController", true)!;
    static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    static void Set(object controller, string name, object? value) => ControllerType.GetField(name, BindingFlags.Instance|BindingFlags.NonPublic)!.SetValue(controller, value);
    static object? Call(object controller, string method, params object[] values) => ControllerType.GetMethod(method,BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic)!.Invoke(controller, values);
    static object Make(VaultEngine engine, string root, IVaultTransport transport)
    {
        var controller = Activator.CreateInstance(ControllerType)!;
        Set(controller,"vault",engine); Set(controller,"storageDir",Path.Combine(root,"source")); Set(controller,"cacheDir",Path.Combine(root,"cache")); Set(controller,"transport",transport);
        return controller;
    }
    static VaultEngine Create(string root,long cap)
    {
        using var credentials=VaultCredentials.Password("controller regression fixture only");
        return VaultEngine.Create(new VaultOptions { StorageRoot=Path.Combine(root,"source"), CacheRoot=Path.Combine(root,"cache"), PartSizeBytes=cap }, credentials);
    }
    static void Import(long cap,int bytes)
    {
        var root=Path.Combine(Path.GetTempPath(),"mfe-controller-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        object? controller=null;
        try
        {
            var engine=Create(root,cap); controller=Make(engine,root,new ImmediateTransport());
            var data=RandomNumberGenerator.GetBytes(bytes); var original=Path.Combine(root,"input.bin"); File.WriteAllBytes(original,data);
            Call(controller,"Execute","importFiles",JsonSerializer.SerializeToElement(new { paths=new[]{original} }));
            var actual=new byte[bytes]; Assert(engine.ReadRange("input.bin",0,actual)==bytes && data.SequenceEqual(actual),"Imported bytes changed");
            var payload = Math.Min(65536, cap - 36);
            var perPart = (cap / (payload + 36)) * payload;
            var expected=(bytes+perPart-1)/perPart;
            Assert(Directory.GetFiles(Path.Combine(root,"cache","parts"),"*.mfe").LongLength==expected,"Import rewrote encryption records repeatedly");
            Console.WriteLine($"PASS import exact bytes and record count at {cap} byte cap");
        }
        finally { if(controller is IDisposable disposable) disposable.Dispose(); if(Directory.Exists(root)) Directory.Delete(root,true); }
    }
    static async Task NetworkLifetime()
    {
        var root=Path.Combine(Path.GetTempPath(),"mfe-controller-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        var engine=Create(root,1024); var network=new BlockingTransport(); var controller=Make(engine,root,network);
        try
        {
            engine.CreateFile("cached.bin"); engine.WriteRange("cached.bin",0,new byte[]{1,2,3}); engine.FlushAsync().GetAwaiter().GetResult();
            var sync=Task.Run(()=>Call(controller,"SyncIfUnlocked"));
            await network.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            var another=Task.Run(()=>Call(controller,"SyncIfUnlocked")); await another.WaitAsync(TimeSpan.FromSeconds(2));
            Assert(network.Calls==1,"Concurrent sync started duplicate network work");
            var read=Task.Run(()=> { var status=Call(controller,"Status"); byte[] bytes=new byte[3]; Assert(engine.ReadRange("cached.bin",0,bytes)==3 && bytes.SequenceEqual(new byte[]{1,2,3}),"Cached read changed"); return status; });
            await read.WaitAsync(TimeSpan.FromSeconds(2));
            var locked=Task.Run(()=>Call(controller,"Execute","lock",JsonSerializer.SerializeToElement(new{})));
            await locked.WaitAsync(TimeSpan.FromSeconds(2));
            Assert(!sync.IsCompleted,"Fixture network unexpectedly ended before lock proof");
            try { Call(controller,"Execute","unlock",JsonSerializer.SerializeToElement(new{})); throw new Exception("Reopen raced old network ownership"); }
            catch(TargetInvocationException error) when(error.InnerException is InvalidOperationException stopped && stopped.Message.Contains("synchronization is stopping",StringComparison.OrdinalIgnoreCase)) { }
            network.Release.TrySetResult(); await sync.WaitAsync(TimeSpan.FromSeconds(2));
            var status=JsonSerializer.SerializeToElement(Call(controller,"Status")); Assert(status.GetProperty("locked").GetBoolean(),"Late network completion changed engine state");
            Console.WriteLine("PASS single-flight network, cached read/status, lock without waiting, stale completion isolation");
        }
        finally { network.Release.TrySetResult(); ((IDisposable)controller).Dispose(); Directory.Delete(root,true); }
    }
    static async Task PartialHistoryRetry()
    {
        var root=Path.Combine(Path.GetTempPath(),"mfe-controller-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        var engine=Create(root,1024); var controller=Make(engine,root,new ImmediateTransport());
        try
        {
            var source=Path.Combine(root,"source"); var commits=Path.Combine(source,"commits"); var held=commits+".held";
            if(Directory.Exists(commits)) Directory.Move(commits,held);
            File.WriteAllText(commits,"intentional publication obstruction");
            engine.CreateFile("retry.bin"); engine.WriteRange("retry.bin",0,new byte[]{7,8,9}); await engine.FlushAsync();
            Assert(engine.Status.PendingCommits>0,"Fixture did not preserve a failed publication");
            var history=new GitVaultHistory(source,Path.Combine(root,"history")); await history.InitializeAsync();
            Set(controller,"historyStore",history); Set(controller,"historySourceRoot",source); Set(controller,"historyPending",true);
            Call(controller,"RecordHistory",CancellationToken.None);
            Assert((bool)ControllerType.GetField("historyPending",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(controller)!,"Partial publication cleared retry flag");
            File.Delete(commits); if(Directory.Exists(held)) Directory.Move(held,commits);
            await engine.FlushAsync(); Assert(engine.Status.PendingCommits==0,"Recovered publication remains pending");
            Call(controller,"RecordHistory",CancellationToken.None);
            var tree=await new VaultProcessRunner().RunAsync("git",new[]{"ls-tree","-r","--name-only","HEAD"},Path.Combine(root,"history"));
            Assert(tree.ExitCode==0,"Recovered history tree unavailable");
            var names=tree.Text.Split('\n',StringSplitOptions.RemoveEmptyEntries).ToHashSet();
            Assert(engine.GetEncryptedSnapshotPaths().All(names.Contains),"Recovered encrypted metadata or parts absent from history");
            Console.WriteLine("PASS partial publication retains history retry and recovered metadata/parts enter history");
        }
        finally { ((IDisposable)controller).Dispose(); foreach(var file in Directory.EnumerateFiles(root,"*",SearchOption.AllDirectories)) File.SetAttributes(file,FileAttributes.Normal); Directory.Delete(root,true); }
    }
    static async Task OfflineUnlock()
    {
        var root=Path.Combine(Path.GetTempPath(),"mfe-controller-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        var controller=Activator.CreateInstance(ControllerType)!; var backend=new OfflineTransport();
        try
        {
            string historicalId; string[] historicalParts;
            using(var engine=Create(root,1024))
            {
                engine.CreateFile("pinned.bin"); engine.WriteRange("pinned.bin",0,new byte[]{4,5,6}); await engine.SaveVersionAsync("pinned.bin");
                historicalId=engine.ListVersions().First().Id;
                historicalParts=Directory.GetFiles(Path.Combine(root,"cache","parts"),"*.mfe").Select(Path.GetFileName).Cast<string>().ToArray();
                engine.WriteRange("pinned.bin",0,new byte[]{7,8,9}); await engine.SetPinnedAsync("pinned.bin",true); await engine.FlushAsync();
            }
            Func<VaultOptions,string,string,(IVaultTransport,GitVaultHistory)> factory=(options,history,repository)=>(backend,new GitVaultHistory(options.StorageRoot,Path.Combine(root,"history")));
            Set(controller,"privateTransportFactory",factory);
            var args=new {storageDir=Path.Combine(root,"source"),cacheDir=Path.Combine(root,"cache"),transport="privateGit",remoteRepository="fixture/private",password="controller regression fixture only"};
            var opened=JsonSerializer.SerializeToElement(Call(controller,"Execute","unlock",JsonSerializer.SerializeToElement(args)));
            Assert(!opened.GetProperty("locked").GetBoolean()&&!opened.GetProperty("transport").GetProperty("available").GetBoolean(),"Offline cached unlock reported remote availability");
            Assert(opened.GetProperty("sync").GetProperty("error").GetString()!.Contains("offline"),"Offline warning absent");
            Assert(opened.GetProperty("transport").GetProperty("pendingSynchronization").GetBoolean(),"Unconfirmed private synchronization reported complete");
            var engineField=ControllerType.GetField("vault",BindingFlags.Instance|BindingFlags.NonPublic)!;
            var current=(VaultEngine)engineField.GetValue(controller)!; var bytes=new byte[3]; Assert(current.ReadRange("pinned.bin",0,bytes)==3&&bytes.SequenceEqual(new byte[]{7,8,9}),"Pinned cached read failed offline");
            foreach(var part in historicalParts) foreach(var folder in new[]{"source","cache"}) { var absent=Path.Combine(root,folder,"parts",part); if(File.Exists(absent)) File.Delete(absent); }
            Assert(!current.ListVersions().Single(v=>v.Id==historicalId).IsAvailable,"Missing historical row reported available offline");
            try { Call(controller,"Execute","restoreVersion",JsonSerializer.SerializeToElement(new {versionId=historicalId})); throw new Exception("Unavailable historical restore succeeded"); }
            catch(TargetInvocationException error) when(error.InnerException is InvalidOperationException needed&&needed.Message.Contains("Connect to private storage")) { }
            Assert(current.ReadRange("pinned.bin",0,bytes)==3&&bytes.SequenceEqual(new byte[]{7,8,9}),"Failed offline historical restore changed current pinned bytes");
            Assert(backend.Hydrations==0,"Pinned offline read requested network hydration");
            await current.SaveDueVersionsAsync(DateTimeOffset.MaxValue); backend.Offline=false; Call(controller,"SyncIfUnlocked");
            var online=JsonSerializer.SerializeToElement(Call(controller,"Status")); Assert(online.GetProperty("transport").GetProperty("available").GetBoolean()&&online.GetProperty("sync").GetProperty("error").ValueKind==JsonValueKind.Null,"Successful synchronization did not clear offline warning");
            Assert(!online.GetProperty("transport").GetProperty("pendingSynchronization").GetBoolean(),"Successful second network pass left publication pending");
            Call(controller,"Execute","lock",JsonSerializer.SerializeToElement(new{})); backend.Offline=true;
            var fresh=new {storageDir=Path.Combine(root,"fresh-source"),cacheDir=Path.Combine(root,"fresh-cache"),transport="privateGit",remoteRepository="fixture/private",password="controller regression fixture only"};
            try { Call(controller,"Execute","unlock",JsonSerializer.SerializeToElement(fresh)); throw new Exception("Uncached offline vault opened"); }
            catch(TargetInvocationException error) when(error.InnerException is InvalidOperationException needed&&needed.Message.Contains("Connect to private storage")) { }
            Assert(!Directory.Exists(fresh.storageDir),"Offline fresh unlock created a staging vault");
            Console.WriteLine("PASS authenticated cached private unlock, pinned offline read, remote availability warning/recovery, fresh connection requirement");
        }
        finally { ((IDisposable)controller).Dispose(); foreach(var file in Directory.EnumerateFiles(root,"*",SearchOption.AllDirectories)) File.SetAttributes(file,FileAttributes.Normal); Directory.Delete(root,true); }
    }
    sealed class OfflineTransport : IVaultTransport
    {
        public bool Offline=true; public int Hydrations;
        public Task InitializeAsync(CancellationToken ct=default)=>Task.CompletedTask;
        public Task SyncAsync(CancellationToken ct=default)=>Offline?Task.FromException(new IOException("fixture network offline")):Task.CompletedTask;
        public Task EnsureFileAsync(string path,CancellationToken ct=default) { Hydrations++; return Task.FromException(new IOException("fixture network offline")); }
    }
    static async Task HistorySubprocessCallback()
    {
        var root=Path.Combine(Path.GetTempPath(),"mfe-controller-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        var engine=Create(root,1024); var controller=Make(engine,root,new ImmediateTransport());
        var runner=new CallbackRunner(controller);
        try
        {
            engine.CreateFile("cached.bin"); engine.WriteRange("cached.bin",0,new byte[]{2,3,4}); await engine.FlushAsync();
            Set(controller,"historyStore",new GitVaultHistory(Path.Combine(root,"source"),Path.Combine(root,"history"),runner));
            Set(controller,"historySourceRoot",Path.Combine(root,"source")); Set(controller,"historyPending",true);
            var sync=Task.Run(()=>Call(controller,"SyncIfUnlocked"));
            await runner.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            var callbacks=Task.Run(()=> { Call(controller,"Status"); var bytes=new byte[3]; Assert(engine.ReadRange("cached.bin",0,bytes)==3,"Cached read blocked by local subprocess"); Call(controller,"Unmount"); });
            await callbacks.WaitAsync(TimeSpan.FromSeconds(2));
            var locked=Task.Run(()=>Call(controller,"Execute","lock",JsonSerializer.SerializeToElement(new{}))); await locked.WaitAsync(TimeSpan.FromSeconds(2));
            Assert(!sync.IsCompleted,"History fixture ended before prompt lock proof");
            runner.Release.TrySetResult(); await sync.WaitAsync(TimeSpan.FromSeconds(10));
            Assert(runner.CallbackAcquired,"History process could not acquire callback gate");
            Console.WriteLine("PASS local history subprocess callback, cached read/status/unmount/lock without waiting, stale history completion");
        }
        finally { runner.Release.TrySetResult(); ((IDisposable)controller).Dispose(); foreach(var file in Directory.EnumerateFiles(root,"*",SearchOption.AllDirectories)) File.SetAttributes(file,FileAttributes.Normal); Directory.Delete(root,true); }
    }
    sealed class CallbackRunner(object controller) : IVaultProcessRunner
    {
        public TaskCompletionSource Started=new(TaskCreationOptions.RunContinuationsAsynchronously), Release=new(TaskCreationOptions.RunContinuationsAsynchronously);
        public bool CallbackAcquired;
        public async Task<VaultProcessResult> RunAsync(string executable,IReadOnlyList<string> arguments,string directory,CancellationToken ct=default)
        {
            // Simulate Windows process startup querying a mounted volume. This
            // requires the real controller callback lock, not a transport fake.
            await Task.Run(()=>Call(controller,"Status")).WaitAsync(TimeSpan.FromSeconds(2));
            CallbackAcquired=true; Started.TrySetResult();
            await Release.Task;
            ct.ThrowIfCancellationRequested();
            return await new VaultProcessRunner().RunAsync(executable,arguments,directory,ct);
        }
    }
    static async Task FilesystemHydrationCallback()
    {
        var root=Path.Combine(Path.GetTempPath(),"mfe-controller-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        var engine=Create(root,1024*1024); var controller=Make(engine,root,new ImmediateTransport());
        var fsType=Assembly.Load("MaterialFileEncryptor.Host").GetType("MaterialFileEncryptor.Host.VaultFileSystem",true)!;
        object? adapter=null, remoteNode=null, remoteHandle=null, cachedNode=null, cachedHandle=null;
        var started=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); var release=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously); int fetched=0;
        object? Invoke(string method,object?[] args)=>fsType.GetMethod(method)!.Invoke(adapter,args);
        byte[] Read(object node,object handle,int length)
        {
            var pointer=System.Runtime.InteropServices.Marshal.AllocHGlobal(length);
            try { object?[] args={node,handle,pointer,0UL,(uint)length,0U}; var result=(int)Invoke("Read",args)!; Assert(result==0,"Filesystem read returned failure"); var bytes=new byte[(uint)args[5]!]; System.Runtime.InteropServices.Marshal.Copy(pointer,bytes,0,bytes.Length); return bytes; }
            finally { System.Runtime.InteropServices.Marshal.FreeHGlobal(pointer); }
        }
        try
        {
            var remote=RandomNumberGenerator.GetBytes(4*1024*1024); engine.CreateFile("remote.bin"); engine.WriteRange("remote.bin",0,remote); await engine.FlushAsync();
            var parts=Directory.GetFiles(Path.Combine(root,"source","parts"),"*.mfe"); var backup=Path.Combine(root,"remote-backup"); Directory.CreateDirectory(backup);
            foreach(var part in parts) { File.Copy(part,Path.Combine(backup,Path.GetFileName(part))); }
            engine.CreateFile("cached.bin"); engine.WriteRange("cached.bin",0,new byte[]{3,4,5}); await engine.SetPinnedAsync("cached.bin",true); await engine.FlushAsync();
            foreach(var part in parts) { File.Delete(part); File.Delete(Path.Combine(root,"cache","parts",Path.GetFileName(part))); }
            var callbackGate=ControllerType.GetField("gate",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(controller)!;
            adapter=Activator.CreateInstance(fsType,engine,callbackGate)!;
            object?[] cachedOpen={"\\cached.bin",0U,0U,null,null,null,null}; Assert((int)Invoke("Open",cachedOpen)! == 0,"Cached open failed"); cachedNode=cachedOpen[3]; cachedHandle=cachedOpen[4];
            object?[] remoteOpen={"\\remote.bin",0U,0U,null,null,null,null}; Assert((int)Invoke("Open",remoteOpen)! == 0,"Remote open failed"); remoteNode=remoteOpen[3]; remoteHandle=remoteOpen[4];
            engine.HydrateEncryptedFileAsync=async(relative,ct)=>
            {
                Interlocked.Increment(ref fetched);
                await Task.Run(()=> { Call(controller,"Status"); Assert(Read(cachedNode!,cachedHandle!,3).SequenceEqual(new byte[]{3,4,5}),"Cached callback blocked or changed"); }).WaitAsync(TimeSpan.FromSeconds(2));
                started.TrySetResult(); await release.Task.WaitAsync(ct);
                File.Copy(Path.Combine(backup,Path.GetFileName(relative)),Path.Combine(root,"source",relative),true);
            };
            var pending=Task.Run(()=>Read(remoteNode!,remoteHandle!,4096)); await started.Task.WaitAsync(TimeSpan.FromSeconds(10));
            await Task.Run(()=>Call(controller,"Status")).WaitAsync(TimeSpan.FromSeconds(2));
            Assert(!(bool)Invoke("BeginUnmount",Array.Empty<object>())!,"Pending file hydration allowed unmount");
            release.TrySetResult(); var actual=await pending.WaitAsync(TimeSpan.FromSeconds(10));
            Assert(actual.SequenceEqual(remote.Take(4096)),"Hydrated range bytes changed"); Assert(fetched==1,"A small read eagerly fetched unrelated file chunks");
            var before=JsonSerializer.Serialize(new { entry=engine.GetInfo("remote.bin"), versions=engine.ListVersions(), bin=engine.ListDeleted() });
            engine.HydrateEncryptedFileAsync=(_,_)=>Task.FromException(new IOException("intentional missing hydration"));
            var writePointer=System.Runtime.InteropServices.Marshal.AllocHGlobal(1);
            try
            {
                System.Runtime.InteropServices.Marshal.WriteByte(writePointer,123);
                object?[] writeArgs={remoteNode,remoteHandle,writePointer,2UL*1024*1024,1U,false,false,0U,null};
                try { Invoke("Write",writeArgs); throw new Exception("Missing write hydration succeeded"); }
                catch(TargetInvocationException error) when(error.InnerException is IOException) { }
            }
            finally { System.Runtime.InteropServices.Marshal.FreeHGlobal(writePointer); }
            Assert(JsonSerializer.Serialize(new { entry=engine.GetInfo("remote.bin"), versions=engine.ListVersions(), bin=engine.ListDeleted() })==before,"Failed hydration changed file or history/bin state");
            engine.SetPartSize(2*1024*1024);
            int overwriteFetches=0;
            engine.HydrateEncryptedFileAsync=async(relative,ct)=>
            {
                Interlocked.Increment(ref overwriteFetches);
                await Task.Run(()=> { Call(controller,"Status"); Assert(Read(cachedNode!,cachedHandle!,3).SequenceEqual(new byte[]{3,4,5}),"Overwrite hydration blocked cached callback"); }).WaitAsync(TimeSpan.FromSeconds(2));
                File.Copy(Path.Combine(backup,Path.GetFileName(relative)),Path.Combine(root,"source",relative),true);
            };
            object?[] overwriteArgs={remoteNode,remoteHandle,32U,true,0UL,null};
            Assert((int)Invoke("Overwrite",overwriteArgs)! == 0,"Prepared overwrite failed after part-cap change");
            Assert(overwriteFetches==0,"Truncate-to-zero unnecessarily retrieved discarded payload");
            var overwritten=engine.GetInfo("remote.bin")!;
            Assert(overwritten.Length==0&&overwritten.Attributes==32U,"Overwrite did not atomically truncate and set attributes");
            engine.SetLength("remote.bin", 4096);
            Assert(Read(remoteNode!,remoteHandle!,4096).All(value=>value==0),"Truncated remote payload returned after growth");
            Console.WriteLine("PASS actual filesystem hydration allows status/cached callback, retains busy handle, retrieves only requested chunk, missing write unchanged, prepared overwrite after cap change");
        }
        finally
        {
            release.TrySetResult();
            if(remoteHandle is not null) Invoke("Close",new[]{remoteNode,remoteHandle}); if(cachedHandle is not null) Invoke("Close",new[]{cachedNode,cachedHandle});
            ((IDisposable)controller).Dispose(); foreach(var file in Directory.EnumerateFiles(root,"*",SearchOption.AllDirectories)) File.SetAttributes(file,FileAttributes.Normal); Directory.Delete(root,true);
        }
    }
    static async Task RestoreBackgroundHistory()
    {
        var root=Path.Combine(Path.GetTempPath(),"mfe-controller-"+Guid.NewGuid().ToString("N")); Directory.CreateDirectory(root);
        var engine=Create(root,10*1024*1024); var controller=Make(engine,root,new FolderVaultTransport(Path.Combine(root,"source")));
        var history=new GitVaultHistory(Path.Combine(root,"cache"),Path.Combine(root,"history"));
        Set(controller,"historyStore",history); Set(controller,"historySourceRoot",Path.Combine(root,"cache")); Set(controller,"historyPending",true);
        engine.HistoryChanged+=()=>Set(controller,"historyPending",true);
        try
        {
            engine.CreateFile("restored.bin"); engine.WriteRange("restored.bin",0,new byte[]{1,2,3}); await engine.SaveVersionAsync("restored.bin");
            var version=engine.ListVersions().First().Id;
            engine.WriteRange("restored.bin",0,new byte[]{4,5,6}); await engine.FlushAsync();
            Call(controller,"Execute","restoreVersion",JsonSerializer.SerializeToElement(new{versionId=version}));
            async Task Confirm()
            {
                Set(controller,"nextSyncAttempt",DateTimeOffset.MinValue); Call(controller,"TickIfUnlocked");
                var until=DateTimeOffset.UtcNow.AddSeconds(45);
                while(DateTimeOffset.UtcNow<until)
                {
                    var status=JsonSerializer.SerializeToElement(Call(controller,"Status"));
                    if(!status.GetProperty("sync").GetProperty("running").GetBoolean() && !(bool)ControllerType.GetField("historyPending",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(controller)!)
                    {
                        Assert(status.GetProperty("sync").GetProperty("error").ValueKind==JsonValueKind.Null,"Background restore synchronization reported an error");
                        return;
                    }
                    await Task.Delay(25);
                }
                throw new TimeoutException("Background restored history did not complete");
            }
            await Confirm(); var afterVersion=(await history.ListSnapshotsAsync()).First();
            engine.Delete("restored.bin"); await engine.FlushAsync(); var deleted=engine.ListDeleted().First().Id;
            Call(controller,"Execute","restoreDeleted",JsonSerializer.SerializeToElement(new{ids=new[]{deleted}}));
            await Confirm(); Assert((await history.ListSnapshotsAsync()).First()!=afterVersion,"Recycle restore did not publish new local history");
            var bytes=new byte[3]; Assert(engine.ReadRange("restored.bin",0,bytes)==3&&bytes.SequenceEqual(new byte[]{1,2,3}),"Restored historical bytes changed");
            Console.WriteLine("PASS historical and recycled restores complete background folder synchronization and record real history");
        }
        finally { ((IDisposable)controller).Dispose(); foreach(var file in Directory.EnumerateFiles(root,"*",SearchOption.AllDirectories))File.SetAttributes(file,FileAttributes.Normal); Directory.Delete(root,true); }
    }
    public static async Task Main() { Import(10*1024*1024,10*1024*1024+127); Import(90000000,1024*1024+127); await NetworkLifetime(); await PartialHistoryRetry(); await OfflineUnlock(); await HistorySubprocessCallback(); await FilesystemHydrationCallback(); await RestoreBackgroundHistory(); }
    sealed class ImmediateTransport : IVaultTransport
    {
        public Task InitializeAsync(CancellationToken ct=default)=>Task.CompletedTask;
        public Task SyncAsync(CancellationToken ct=default)=>Task.CompletedTask;
        public Task EnsureFileAsync(string path,CancellationToken ct=default)=>Task.CompletedTask;
    }
    sealed class BlockingTransport : IVaultTransport
    {
        public int Calls; public TaskCompletionSource Started=new(TaskCreationOptions.RunContinuationsAsynchronously), Release=new(TaskCreationOptions.RunContinuationsAsynchronously);
        public Task InitializeAsync(CancellationToken ct=default)=>Task.CompletedTask;
        public async Task SyncAsync(CancellationToken ct=default) { Interlocked.Increment(ref Calls); Started.TrySetResult(); await Release.Task; }
        public Task EnsureFileAsync(string path,CancellationToken ct=default)=>Task.CompletedTask;
    }
}
