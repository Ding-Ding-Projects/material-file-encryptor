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
        Console.WriteLine("Mounted outer teardown self-test passed: unknown settlement, unknown teardown and unknown writer retain helper without retry or stop.");
    }
}

internal static class RetainedRunnerHold
{
    // Reaching the observation limit ends active observation, not pipe ownership.
    internal static async Task Run(Task ownedExit,Task<System.Text.Json.JsonElement>? originalOutcome,
        Func<string,System.Text.Json.JsonElement?,Task> record,Task? observationDeadline=null)
    {
        Task deadline=observationDeadline??Task.Delay(TimeSpan.FromHours(1));
        await record("holding-original-pipes",null);
        if(originalOutcome is not null)
        {
            Task first=await Task.WhenAny(ownedExit,originalOutcome,deadline);
            if(first==originalOutcome)
            {
                try{await record("original-response-observed-no-acceptance",await originalOutcome);}
                catch(Exception){await record("original-response-error-retained",null);}
            }
        }
        if(await Task.WhenAny(ownedExit,deadline)!=ownedExit)
        {
            await record("observation-limit-retained",null);
            // Passive wait retains original handles. Only separately reviewed owned
            // recovery or actual process exit may end this hold; no request is sent.
        }
        await ownedExit;
        await record("owned-helper-exit-observed",null);
    }
}
