using System.Text.Json;
using MaterialFileEncryptor.Host;

internal static class BackgroundPriorityRegression
{
    internal static void Run()
    {
        ThreadPriority original=Thread.CurrentThread.Priority;
        using(new BackgroundPriorityScope(true))
            if(OperatingSystem.IsWindows()&&original>ThreadPriority.BelowNormal&&Thread.CurrentThread.Priority!=ThreadPriority.BelowNormal)
                throw new Exception("Responsive scope did not lower background priority.");
        if(Thread.CurrentThread.Priority!=original)throw new Exception("Priority was not restored after normal completion.");
        try{using var scope=new BackgroundPriorityScope(true);throw new IOException("Synthetic operation failure");}catch(IOException){ }
        if(Thread.CurrentThread.Priority!=original)throw new Exception("Priority was not restored after an exception.");
        using(new BackgroundPriorityScope(false))if(Thread.CurrentThread.Priority!=original)throw new Exception("Throughput scope changed priority.");
        using var controller=new VaultController();
        controller.Status();var initial=JsonSerializer.SerializeToElement(controller.StatusSummary());
        if(initial.GetProperty("performanceMode").GetString()!="responsive")throw new Exception("Default mode is not responsive.");
        var mode=JsonSerializer.SerializeToElement(new{mode="throughput"});controller.Execute("setPerformanceMode",mode);
        if(JsonSerializer.SerializeToElement(controller.StatusSummary()).GetProperty("performanceMode").GetString()!="throughput")throw new Exception("Throughput setting was not applied.");
        bool rejected=false;try{controller.Execute("setPerformanceMode",JsonSerializer.SerializeToElement(new{mode="unknown"}));}catch(ArgumentException){rejected=true;}
        if(!rejected)throw new Exception("Invalid performance mode was accepted.");
        Console.WriteLine("PASS background priority lowering, exception restoration, throughput mode and setting validation");
    }
}
