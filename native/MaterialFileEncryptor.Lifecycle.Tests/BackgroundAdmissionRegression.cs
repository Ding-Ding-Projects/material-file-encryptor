using System.Text.Json;
using MaterialFileEncryptor.Host;

internal static class BackgroundAdmissionRegression
{
    internal static async Task Run()
    {
        using var controller=new VaultController();
        if(controller.TryReserveForceLock() is not null)throw new Exception("Idle force-lock reservation failed.");
        try
        {
            if(controller.TryBeginBackgroundWork())throw new Exception("Background work entered after force-lock admission.");
            await Task.Run(()=>{controller.SyncIfUnlocked();controller.TickIfUnlocked();}).WaitAsync(TimeSpan.FromSeconds(1));
        }
        finally{controller.EndForceLock();}
        if(!controller.TryBeginBackgroundWork())throw new Exception("Background work could not resume after force lock.");
        try
        {
            var busy=JsonSerializer.SerializeToElement(controller.TryReserveForceLock());
            if(!busy.GetProperty("busy").GetBoolean()||busy.GetProperty("activeSynchronization").GetInt32()!=1)
                throw new Exception("Admitted background work did not veto force lock.");
        }
        finally{controller.EndBackgroundWork();}
        for(int attempt=0;attempt<200;attempt++)
        {
            using var start=new ManualResetEventSlim();
            var background=Task.Run(()=>{start.Wait();return controller.TryBeginBackgroundWork();});
            var force=Task.Run(()=>{start.Wait();return controller.TryReserveForceLock() is null;});
            start.Set();await Task.WhenAll(background,force);
            if(background.Result==force.Result)throw new Exception("Concurrent admissions did not have exactly one winner.");
            if(background.Result)controller.EndBackgroundWork();else controller.EndForceLock();
        }
        Console.WriteLine("PASS force-lock/background mutual exclusion, timer rejection and 200 concurrent admission races");
    }
}
