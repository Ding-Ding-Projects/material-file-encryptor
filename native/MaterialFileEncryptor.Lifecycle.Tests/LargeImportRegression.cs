using System.Diagnostics;
using System.Text.Json;
using MaterialFileEncryptor.Core;

internal static class LargeImportRegression
{
    internal static void Run()
    {
        string root=Path.Combine(Path.GetTempPath(),"mfe-large-import-"+Guid.NewGuid().ToString("N"));
        string phase="create";long written=0;var elapsed=Stopwatch.StartNew();
        Directory.CreateDirectory(root);
        try
        {
            using var credentials=VaultCredentials.Password("synthetic large import fixture");
            using var engine=VaultEngine.Create(new(){StorageRoot=Path.Combine(root,"storage"),CacheRoot=Path.Combine(root,"cache"),PartSizeBytes=10*1024*1024},credentials);
            byte[] block=new byte[65536];
            using(var stage=engine.BeginImport("large.bin"))
            {
                phase="staging";
                while(written<512L*1024*1024)
                {
                    if(elapsed.Elapsed>TimeSpan.FromSeconds(60))throw new TimeoutException("Bounded synthetic import exceeded sixty seconds.");
                    stage.Write(written,block);written+=block.Length;
                }
                phase="commit";stage.Commit();phase="verify";
                if(engine.GetInfo("large.bin")?.Length!=written)throw new Exception("Large import length mismatch.");
            }
            Console.WriteLine(JsonSerializer.Serialize(new{test="large-native-import",passed=true,bytes=written,elapsedMilliseconds=elapsed.Elapsed.TotalMilliseconds,phase}));
        }
        catch(Exception error)
        {
            Console.WriteLine(JsonSerializer.Serialize(new{test="large-native-import",passed=false,bytes=written,elapsedMilliseconds=elapsed.Elapsed.TotalMilliseconds,phase,category=error.GetType().Name,hresult=error.HResult}));throw;
        }
        finally{Directory.Delete(root,true);}
    }
}
