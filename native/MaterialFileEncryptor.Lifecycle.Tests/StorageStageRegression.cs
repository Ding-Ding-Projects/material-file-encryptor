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
