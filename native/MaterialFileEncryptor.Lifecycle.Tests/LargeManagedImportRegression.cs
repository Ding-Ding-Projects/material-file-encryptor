using System.Diagnostics;
using System.Text.Json;
using MaterialFileEncryptor.Host;

internal static class LargeManagedImportRegression
{
    internal static async Task Run(bool background=false)
    {
        string root=Path.Combine(Path.GetTempPath(),"mfe-large-managed-"+Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        using var controller=new VaultController();
        try
        {
            string source=Path.Combine(root,"source.bin");
            using(var file=File.Create(source))file.SetLength(512L*1024*1024);
            controller.Execute("create",JsonSerializer.SerializeToElement(new{storageDir=Path.Combine(root,"storage"),cacheDir=Path.Combine(root,"cache"),password="synthetic managed import",partSizeBytes=10485760,transport="folder"}));
            var start=JsonSerializer.SerializeToElement(controller.Execute("startImport",JsonSerializer.SerializeToElement(new{paths=new[]{source}})));
            string id=start.GetProperty("operationId").GetString()!;
            var elapsed=Stopwatch.StartNew();long lastTick=-1;
            while(true)
            {
                if(background && elapsed.ElapsedMilliseconds/1000!=lastTick){lastTick=elapsed.ElapsedMilliseconds/1000;controller.TickIfUnlocked();controller.Status();}
                var values=JsonSerializer.SerializeToElement(controller.Execute("operations",JsonSerializer.SerializeToElement(new{})));
                var item=values.EnumerateArray().Single(value=>value.GetProperty("operationId").GetString()==id);
                string state=item.GetProperty("state").GetString()!;
                if(state is "failed" or "completed" or "cancelled")
                {
                    Console.WriteLine(JsonSerializer.Serialize(new{test="large-managed-import",elapsedMilliseconds=elapsed.Elapsed.TotalMilliseconds,operation=item}));
                    if(state!="completed")throw new Exception("Synthetic managed import did not complete.");
                    break;
                }
                if(elapsed.Elapsed>TimeSpan.FromSeconds(90)){controller.Execute("cancelOperation",JsonSerializer.SerializeToElement(new{operationId=id}));throw new TimeoutException("Synthetic managed import exceeded its bound.");}
                await Task.Delay(100);
            }
        }
        finally {controller.Dispose();Directory.Delete(root,true);}
    }
}
