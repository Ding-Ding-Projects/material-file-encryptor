internal static class MountedTeardown
{
    internal sealed record Disposition(bool Retained,string Reason,string[] Errors);
    internal static async Task<Disposition> Run(bool writerReleased,Func<bool> unknownOutcome,Func<Task> detach,Func<Task> stop)
    {
        if(!writerReleased)return new(true,"writer-exit-unknown",Array.Empty<string>());
        if(unknownOutcome())return new(true,"protocol-outcome-unknown",Array.Empty<string>());
        var errors=new List<string>();
        try{await detach();}catch(Exception error){errors.Add("detach:"+error.GetType().Name+": "+error.Message);}
        // A timeout during teardown is just as uncertain as one during settlement.
        if(unknownOutcome())return new(true,"protocol-outcome-unknown",errors.ToArray());
        try{await stop();}catch(Exception error){errors.Add("stop:"+error.GetType().Name+": "+error.Message);}
        return new(false,"owned-stop-attempted",errors.ToArray());
    }
    internal static async Task SelfTest()
    {
        foreach(string scenario in new[]{"known","settlement-timeout","teardown-timeout","writer-unknown"})
        {
            bool unknown=scenario=="settlement-timeout";int detaches=0,stops=0;
            var result=await Run(scenario!="writer-unknown",()=>unknown,()=>{detaches++;if(scenario=="teardown-timeout"){unknown=true;throw new TimeoutException("injected in-flight detach");}return Task.CompletedTask;},()=>{stops++;return Task.CompletedTask;});
            bool retained=scenario!="known";
            if(result.Retained!=retained||stops!=(retained?0:1)||detaches!=(scenario is "known" or "teardown-timeout"?1:0))throw new Exception("Outer teardown admitted an unsafe retry or stop: "+scenario);
        }
        var exit=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);var states=new List<string>();
        var hold=RetainedRunnerHold.Run(exit.Task,null,(state,response)=>{states.Add(state);return Task.CompletedTask;},Task.CompletedTask);
        await Task.Yield();
        if(hold.IsCompleted||!states.Contains("observation-limit-retained"))throw new Exception("Retention hold closed pipes at its observation deadline.");
        exit.SetResult();await hold;
        if(states.Last()!="owned-helper-exit-observed")throw new Exception("Retention hold released without owned exit.");
        foreach(string fault in new[]{"identity","serialization","console"})
        {
            var released=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);bool entered=false;
            var ownership=RetentionOwnership.Run(()=>throw new IOException(fault),()=>true,async()=>{entered=true;await released.Task;});
            if(!entered||ownership.IsCompleted)throw new Exception("Reporting failure released ownership: "+fault);
            released.SetResult();try{await ownership;throw new Exception("Original reporting failure was lost.");}catch(IOException error){if(error.Message!=fault)throw;}
        }
        var recordExit=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var failedReply=Task.FromException<System.Text.Json.JsonElement>(new IOException("original reply failed"));
        int recordAttempts=0;
        var throwingRecord=RetainedRunnerHold.Run(recordExit.Task,failedReply,(state,response)=>{recordAttempts++;throw new IOException("record writer failed");},Task.CompletedTask);
        await Task.Yield();if(throwingRecord.IsCompleted||recordAttempts<2)throw new Exception("A throwing record callback released ownership.");
        recordExit.SetResult();await throwingRecord;
        var writer=new ThrowingDiagnosticWriter();
        var writerExit=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);bool writerHeld=false;
        var writerFailure=RetentionOwnership.Run(()=>{writer.WriteLine("report");return Task.CompletedTask;},()=>true,async()=>{writerHeld=true;await writerExit.Task;});
        if(!writerHeld||writerFailure.IsCompleted)throw new Exception("Throwing TextWriter skipped ownership retention.");
        writerExit.SetResult();try{await writerFailure;throw new Exception("TextWriter failure was lost.");}catch(IOException){}
        SafeDiagnostics.Write(()=>writer.WriteLine("diagnostic"));
        Console.WriteLine("Mounted outer teardown self-test passed: unknown settlement, unknown teardown and unknown writer retain helper without retry or stop.");
    }
}

internal static class RetainedRunnerHold
{
    static async Task SafeRecord(Func<string,System.Text.Json.JsonElement?,Task> record,string state,System.Text.Json.JsonElement? response)
    {
        try{await record(state,response);}catch{ /* Diagnostics cannot release ownership. */ }
    }
    internal static async Task RunOwned(Func<Task> ownedExit,Func<Task<System.Text.Json.JsonElement>?> originalOutcome,
        Func<string,System.Text.Json.JsonElement?,Task> record)
    {
        Task exit;Task<System.Text.Json.JsonElement>? original=null;
        try{exit=ownedExit();}catch{exit=Task.Delay(Timeout.InfiniteTimeSpan);await SafeRecord(record,"owned-exit-observer-unavailable-retained",null);}
        try{original=originalOutcome();}catch{await SafeRecord(record,"original-response-unavailable-retained",null);}
        await Run(exit,original,record);
    }
    // Reaching the observation limit ends active observation, not pipe ownership.
    internal static async Task Run(Task ownedExit,Task<System.Text.Json.JsonElement>? originalOutcome,
        Func<string,System.Text.Json.JsonElement?,Task> record,Task? observationDeadline=null)
    {
        Task deadline=observationDeadline??Task.Delay(TimeSpan.FromHours(1));
        await SafeRecord(record,"holding-original-pipes",null);
        if(originalOutcome is not null)
        {
            Task first=await Task.WhenAny(ownedExit,originalOutcome,deadline);
            if(first==originalOutcome)
            {
                try{await SafeRecord(record,"original-response-observed-no-acceptance",await originalOutcome);}
                catch(Exception){await SafeRecord(record,"original-response-error-retained",null);}
            }
        }
        if(await Task.WhenAny(ownedExit,deadline)!=ownedExit)
        {
            await SafeRecord(record,"observation-limit-retained",null);
            // Passive wait retains original handles. Only separately reviewed owned
            // recovery or actual process exit may end this hold; no request is sent.
        }
        try{await ownedExit;}catch{await SafeRecord(record,"owned-exit-observation-failed-retained",null);await Task.Delay(Timeout.InfiniteTimeSpan);}
        await SafeRecord(record,"owned-helper-exit-observed",null);
    }
}

internal static class RetentionOwnership
{
    internal static async Task Run(Func<Task> body,Func<bool> retentionRequired,Func<Task> hold)
    {
        try{await body();}
        finally
        {
            if(retentionRequired())
            {
                try{await hold();}
                catch{await Task.Delay(Timeout.InfiniteTimeSpan);}
            }
        }
    }
}
internal static class SafeDiagnostics
{
    internal static void Write(Action write){try{write();}catch{}}
}

internal sealed class ThrowingDiagnosticWriter:System.IO.TextWriter
{
    public override System.Text.Encoding Encoding=>System.Text.Encoding.UTF8;
    public override void WriteLine(string? value)=>throw new IOException("injected diagnostic writer failure");
}
