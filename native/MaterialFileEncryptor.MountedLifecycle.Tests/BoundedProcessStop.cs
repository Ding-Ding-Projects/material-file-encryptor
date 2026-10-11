using System.Diagnostics;

internal sealed record ProcessStopResult(bool ExitEstablished, bool TerminationAttempted, string[] Errors);

internal static class BoundedProcessStop
{
    internal static Task<ProcessStopResult> Run(Process process, Action signal) => Run(signal, () => process.WaitForExitAsync(), () => process.Kill(true), TimeSpan.FromSeconds(15), TimeSpan.FromSeconds(5));

    internal static async Task<ProcessStopResult> Run(Action signal, Func<Task> join, Action terminate, TimeSpan normalWait, TimeSpan terminationWait)
    {
        var errors=new List<string>();
        try { signal(); } catch(Exception error) { errors.Add("signal:"+error.GetType().Name); }
        try { await join().WaitAsync(normalWait); return new(true,false,errors.ToArray()); }
        catch(Exception error) { errors.Add("join:"+error.GetType().Name); }
        try { terminate(); } catch(Exception error) { errors.Add("terminate:"+error.GetType().Name); }
        try { await join().WaitAsync(terminationWait); return new(true,true,errors.ToArray()); }
        catch(Exception error) { errors.Add("post-termination-join:"+error.GetType().Name); }
        return new(false,true,errors.ToArray());
    }

    internal static async Task SelfTest()
    {
        int joins=0;
        var signalFailure=await Run(()=>throw new IOException(),()=>{joins++;return Task.CompletedTask;},()=>throw new Exception("Unexpected termination"),TimeSpan.FromMilliseconds(25),TimeSpan.FromMilliseconds(25));
        if(!signalFailure.ExitEstablished||joins!=1||signalFailure.Errors.Single()!="signal:IOException")throw new Exception("Signal failure prevented joining or erased its result.");
        var never=new TaskCompletionSource();int kills=0;
        var watch=Stopwatch.StartNew();
        var unknown=await Run(()=>{},()=>never.Task,()=>{kills++;throw new InvalidOperationException();},TimeSpan.FromMilliseconds(25),TimeSpan.FromMilliseconds(25));
        if(unknown.ExitEstablished||kills!=1||unknown.Errors.Length!=3||watch.Elapsed>TimeSpan.FromSeconds(2))throw new Exception("Unknown exit was not bounded and retained.");
        joins=0;
        var recovered=await Run(()=>throw new IOException(),()=>++joins==1?never.Task:Task.CompletedTask,()=>{},TimeSpan.FromMilliseconds(25),TimeSpan.FromMilliseconds(25));
        if(!recovered.ExitEstablished||!recovered.TerminationAttempted||recovered.Errors.Length!=2)throw new Exception("Post-termination exit or original signal failure disappeared.");
        Console.WriteLine("PASS signal failure still joins; failed termination and unknown exit are bounded; original signal failure survives post-termination join");
    }
}
