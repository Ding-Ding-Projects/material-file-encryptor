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
            var expected=(bytes+(cap-36)-1)/(cap-36);
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
            Call(controller,"RecordHistoryLocked");
            Assert((bool)ControllerType.GetField("historyPending",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(controller)!,"Partial publication cleared retry flag");
            File.Delete(commits); if(Directory.Exists(held)) Directory.Move(held,commits);
            await engine.FlushAsync(); Assert(engine.Status.PendingCommits==0,"Recovered publication remains pending");
            Call(controller,"RecordHistoryLocked");
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
            var engineField=ControllerType.GetField("vault",BindingFlags.Instance|BindingFlags.NonPublic)!;
            var current=(VaultEngine)engineField.GetValue(controller)!; var bytes=new byte[3]; Assert(current.ReadRange("pinned.bin",0,bytes)==3&&bytes.SequenceEqual(new byte[]{7,8,9}),"Pinned cached read failed offline");
            foreach(var part in historicalParts) foreach(var folder in new[]{"source","cache"}) { var absent=Path.Combine(root,folder,"parts",part); if(File.Exists(absent)) File.Delete(absent); }
            Assert(!current.ListVersions().Single(v=>v.Id==historicalId).IsAvailable,"Missing historical row reported available offline");
            try { Call(controller,"Execute","restoreVersion",JsonSerializer.SerializeToElement(new {versionId=historicalId})); throw new Exception("Unavailable historical restore succeeded"); }
            catch(TargetInvocationException error) when(error.InnerException is InvalidOperationException needed&&needed.Message.Contains("Connect to private storage")) { }
            Assert(current.ReadRange("pinned.bin",0,bytes)==3&&bytes.SequenceEqual(new byte[]{7,8,9}),"Failed offline historical restore changed current pinned bytes");
            Assert(backend.Hydrations==0,"Pinned offline read requested network hydration");
            backend.Offline=false; Call(controller,"SyncIfUnlocked");
            var online=JsonSerializer.SerializeToElement(Call(controller,"Status")); Assert(online.GetProperty("transport").GetProperty("available").GetBoolean()&&online.GetProperty("sync").GetProperty("error").ValueKind==JsonValueKind.Null,"Successful synchronization did not clear offline warning");
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
    public static async Task Main() { Import(10*1024*1024,10*1024*1024+127); Import(90000000,1024*1024+127); await NetworkLifetime(); await PartialHistoryRetry(); await OfflineUnlock(); }
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
