using MaterialFileEncryptor.Core;

internal static class EncryptedSnapshotTests
{
    internal static void Run()
    {
        string root=Path.Combine(Path.GetTempPath(),"mfe-snapshot-test-"+Guid.NewGuid().ToString("N"));
        using var credential=VaultCredentials.KeyFile(Enumerable.Range(0,32).Select(i=>(byte)i).ToArray());
        var options=new VaultOptions{StorageRoot=Path.Combine(root,"source"),CacheRoot=Path.Combine(root,"cache")};
        try
        {
            using var engine=VaultEngine.Create(options,credential);
            engine.CreateFile("original");engine.WriteRange("original",0,new byte[]{1,2,3});engine.FlushAsync().GetAwaiter().GetResult();
            engine.WriteRange("original",0,new byte[]{4,5,6});engine.FlushLocalOnly();
            using var started=new ManualResetEventSlim();using var release=new ManualResetEventSlim();
            engine.EncryptedSnapshotTestPoint=()=>{started.Set();if(!release.Wait(TimeSpan.FromSeconds(10)))throw new TimeoutException();};
            var pending=Task.Run(()=>engine.StageEncryptedSnapshotAsync());
            if(!started.Wait(TimeSpan.FromSeconds(10)))throw new Exception("Snapshot never froze history");
            try
            {
                var mutation=Task.Run(()=>{engine.Rename("original","later");engine.WriteRange("later",0,new byte[]{7,8,9});engine.FlushLocalOnly();return engine.EvictCache(long.MaxValue);});
                if(!mutation.Wait(TimeSpan.FromSeconds(5)))throw new Exception("Staging held the namespace lock");
                if(mutation.Result!=0)throw new Exception("Pinned snapshot parts were reclaimed");
            }
            finally{release.Set();}
            using var snapshot=pending.GetAwaiter().GetResult();
            engine.EncryptedSnapshotTestPoint=null;
            using(var restored=VaultEngine.Open(new VaultOptions{StorageRoot=snapshot.StorageRoot,CacheRoot=Path.Combine(root,"restore")},credential))
            {
                byte[] result=new byte[3];restored.ReadRange("original",0,result);
                if(!result.SequenceEqual(new byte[]{4,5,6})||restored.GetInfo("later") is not null)throw new Exception("Snapshot mixed later namespace state");
            }
            if(Directory.GetFiles(snapshot.StorageRoot,"*",SearchOption.AllDirectories).Any(p=>Path.GetFileName(p).Contains("journal",StringComparison.OrdinalIgnoreCase)))throw new Exception("Snapshot copied journal state");
            using var cancelled=new CancellationTokenSource();cancelled.Cancel();
            try{engine.StageEncryptedSnapshotAsync(cancelled.Token).GetAwaiter().GetResult();throw new Exception("Cancelled snapshot succeeded");}catch(OperationCanceledException){}
            string staged=snapshot.StorageRoot;snapshot.Dispose();if(Directory.Exists(staged))throw new Exception("Snapshot lease leaked its staging folder");
        }
        finally{if(Directory.Exists(root))Directory.Delete(root,true);}
    }
}
