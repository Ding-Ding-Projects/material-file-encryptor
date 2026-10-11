using MaterialFileEncryptor.Core;
using MaterialFileEncryptor.Host;

internal static class StorageStageRegression
{
    internal static void Run()
    {
        string root=Path.Combine(Path.GetTempPath(),"mfe-storage-stage-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        try
        {
            string path=Path.Combine(root,"metadata.mfe");byte[] original=[1,2,3],replacement=[4,5,6];
            foreach(var stage in new[]{StorageOperationStage.MetadataTempCreate,StorageOperationStage.MetadataWrite,StorageOperationStage.MetadataFlush,StorageOperationStage.MetadataReplace})
            {
                File.WriteAllBytes(path,original);var cause=new UnauthorizedAccessException("private synthetic detail");
                try{VaultCrypto.AtomicWrite(path,replacement,current=>{if(current==stage)throw cause;});throw new Exception("Injected failure was ignored.");}
                catch(StorageOperationException error)
                {
                    if(!ReferenceEquals(error.InnerException,cause)||TransferOperationRegistry.ClassifyFailure(error)!="ACCESS_DENIED")throw new Exception("Original failure was lost.");
                    if(TransferOperationRegistry.GetStorageStage(error)!=error.StorageStage)throw new Exception("Trusted storage stage missing.");
                }
                if(!File.ReadAllBytes(path).SequenceEqual(original))throw new Exception("Failed replacement changed prior metadata.");
                if(Directory.GetFiles(root,"*.tmp").Length!=0)throw new Exception("Temporary metadata was not removed.");
            }
            var primary=new UnauthorizedAccessException("primary");
            try{VaultCrypto.AtomicWrite(path,replacement,current=>{if(current==StorageOperationStage.MetadataWrite)throw primary;if(current==StorageOperationStage.MetadataCleanup)throw new IOException("cleanup");});throw new Exception("Primary failure was ignored.");}
            catch(StorageOperationException error){if(!ReferenceEquals(error.InnerException,primary)||error.StorageStage!="metadata-write")throw new Exception("Cleanup replaced the primary failure.");}
            VaultCrypto.AtomicWrite(path,replacement);
            if(!File.ReadAllBytes(path).SequenceEqual(replacement))throw new Exception("Successful atomic install failed.");
            if(OperatingSystem.IsWindows())
            {
                File.WriteAllBytes(path,original);string temporary=Path.Combine(root,"replacement.tmp");File.WriteAllBytes(temporary,replacement);
                using(var blocked=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))
                {
                    bool observed=false;
                    try{File.Move(temporary,path,true);}
                    catch(Exception error) when(error is IOException or UnauthorizedAccessException)
                    {observed=true;if(!AtomicMetadataReplacement.IsSharingConflict(error,temporary,path))throw new Exception("Delete-sharing conflict was not recognized.");}
                    if(!observed)throw new Exception("Missing negative replacement test.");
                    var timer=System.Diagnostics.Stopwatch.StartNew();
                    try{AtomicMetadataReplacement.Replace(temporary,path);throw new Exception("Permanent held reader was ignored.");}
                    catch(Exception error) when(error is IOException or UnauthorizedAccessException){ }
                    if(timer.ElapsedMilliseconds>1000)throw new Exception("Replacement retries exceeded their bound.");
                    if(!File.ReadAllBytes(path).SequenceEqual(original)||!File.ReadAllBytes(temporary).SequenceEqual(replacement))throw new Exception("Failed replacement changed files.");
                }
                using(var heldForCancel=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))
                using(var entered=new ManualResetEventSlim())
                {
                    var registry=new TransferOperationRegistry();
                    var operation=System.Text.Json.JsonSerializer.SerializeToElement(registry.Start(["synthetic"],(_,cancellation,_)=>Task.Run(()=>
                    {
                        entered.Set();
                        try{AtomicMetadataReplacement.Replace(temporary,path);}
                        finally{cancellation.ThrowIfCancellationRequested();}
                    })));
                    if(!entered.Wait(TimeSpan.FromSeconds(1)))throw new Exception("Replacement did not start.");
                    var ack=System.Diagnostics.Stopwatch.StartNew();registry.Cancel(operation.GetProperty("operationId").GetString()!);
                    if(ack.ElapsedMilliseconds>=250)throw new Exception("Cancel acknowledgement waited for metadata replacement.");
                    for(int attempt=0;attempt<100&&registry.Outstanding!=0;attempt++)Thread.Sleep(10);
                    if(registry.Outstanding!=0)throw new Exception("Cancelled replacement failed to settle.");
                }
                using(var held=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read))
                {
                    var release=new Thread(()=>{Thread.Sleep(45);held.Dispose();});release.Start();
                    AtomicMetadataReplacement.Replace(temporary,path);release.Join();
                }
                if(!File.ReadAllBytes(path).SequenceEqual(replacement))throw new Exception("Released reader did not allow atomic replacement.");
                File.WriteAllBytes(path,original);File.SetAttributes(path,FileAttributes.ReadOnly);
                try
                {
                    if(AtomicMetadataReplacement.IsSharingConflict(new UnauthorizedAccessException(),path,path))throw new Exception("Read-only denial was treated as transient sharing.");
                }
                finally{File.SetAttributes(path,FileAttributes.Normal);}
            }
            var untrusted=new IOException();untrusted.Data["storageStage"]="metadata-replace";
            if(TransferOperationRegistry.GetStorageStage(untrusted)!=null)throw new Exception("Untrusted diagnostic data was published.");
            foreach(var stage in Enum.GetValues<StorageOperationStage>())
            {
                try{StorageOperationException.Run(stage,()=>throw new UnauthorizedAccessException());}
                catch(StorageOperationException error){if(TransferOperationRegistry.ClassifyFailure(error)!="ACCESS_DENIED"||TransferOperationRegistry.GetStorageStage(error)==null)throw new Exception("Storage classification failed.");}
            }
            Console.WriteLine("PASS storage stage classification, atomic prior-file preservation and primary-exception retention");
        }
        finally{Directory.Delete(root,true);}
    }
}
