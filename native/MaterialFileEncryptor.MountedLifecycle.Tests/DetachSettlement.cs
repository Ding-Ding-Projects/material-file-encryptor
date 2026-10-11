using System.Diagnostics;
using System.Text.Json;

// Verification policy only. Native forceLock retains sole authority to detach.
internal static class DetachSettlement
{
    internal static readonly TimeSpan Deadline = TimeSpan.FromSeconds(60);
    internal static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(500);
    internal sealed record Observation(string Method,DateTimeOffset StartedUtc,DateTimeOffset FinishedUtc,double ElapsedMilliseconds,JsonElement? Response,string? Error);
    internal sealed record Result(string Terminal,double ElapsedMilliseconds,int Attempts);
    internal static async Task<Result> Run(Func<string,TimeSpan,Task<JsonElement>> call,Func<Observation,Task> record,
        TimeSpan? budget=null,Func<TimeSpan>? elapsed=null,Func<TimeSpan,Task>? delay=null,Func<DateTimeOffset>? utc=null)
    {
        var watch=Stopwatch.StartNew();elapsed??=()=>watch.Elapsed;delay??=Task.Delay;utc??=()=>DateTimeOffset.UtcNow;
        TimeSpan limit=budget??Deadline;int attempts=0;
        if(limit<=TimeSpan.Zero)throw new ArgumentOutOfRangeException(nameof(budget));
        while(elapsed()<limit)
        {
            foreach(string method in new[]{"status","forceLock"})
            {
                TimeSpan remaining=limit-elapsed();if(remaining<=TimeSpan.Zero)return new("deadline-exceeded",elapsed().TotalMilliseconds,attempts);
                DateTimeOffset started=utc();JsonElement response;
                try {response=await call(method,remaining<TimeSpan.FromSeconds(20)?remaining:TimeSpan.FromSeconds(20)).WaitAsync(remaining);}
                catch(Exception error)
                {
                    await record(new(method,started,utc(),elapsed().TotalMilliseconds,null,error.GetType().Name+": "+error.Message));
                    return new(error is TimeoutException?"protocol-timeout":"protocol-error",elapsed().TotalMilliseconds,attempts);
                }
                await record(new(method,started,utc(),elapsed().TotalMilliseconds,response.Clone(),null));
                if(elapsed()>=limit)return new("deadline-exceeded",elapsed().TotalMilliseconds,attempts);
                if(response.ValueKind!=JsonValueKind.Object)return new("invalid-response",elapsed().TotalMilliseconds,attempts);
                if(method=="status")continue;
                attempts++;
                if(!response.TryGetProperty("locked",out var locked)||locked.ValueKind is not (JsonValueKind.True or JsonValueKind.False)||
                   !response.TryGetProperty("busy",out var busy)||busy.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
                    return new("invalid-response",elapsed().TotalMilliseconds,attempts);
                if(locked.GetBoolean()&&!busy.GetBoolean())return new("detached",elapsed().TotalMilliseconds,attempts);
                if(locked.GetBoolean()||!busy.GetBoolean())return new("invalid-response",elapsed().TotalMilliseconds,attempts);
            }
            TimeSpan pause=limit-elapsed();if(pause>Interval)pause=Interval;if(pause>TimeSpan.Zero)await delay(pause);
        }
        return new("deadline-exceeded",elapsed().TotalMilliseconds,attempts);
    }
    internal static async Task SelfTest()
    {
        static JsonElement Json(object value)=>JsonSerializer.SerializeToElement(value);
        static void Require(bool condition,string message){if(!condition)throw new Exception(message);}
        foreach(string mode in new[]{"settles","busy","malformed","timeout","error"})
        {
            TimeSpan now=TimeSpan.Zero;var records=new List<Observation>();int locks=0;
            var result=await Run((method,remaining)=>{
                Require(remaining>TimeSpan.Zero&&remaining<=TimeSpan.FromSeconds(20),"Call exceeded remaining deadline.");
                if(mode=="timeout")throw new TimeoutException("injected timeout");
                if(mode=="error")throw new IOException("injected protocol failure");
                if(method=="status")return Task.FromResult(Json(new{sync=new{running=locks<3}}));
                locks++;return Task.FromResult(mode=="malformed"?Json(new{locked=true}):Json(new{locked=mode=="settles"&&locks>=4,busy=!(mode=="settles"&&locks>=4),activeSynchronization=locks<4?1:0}));
            },record=>{records.Add(record);return Task.CompletedTask;},TimeSpan.FromSeconds(2),()=>now,pause=>{now+=pause;return Task.CompletedTask;},()=>DateTimeOffset.UnixEpoch+now);
            string expected=mode switch{"settles"=>"detached","busy"=>"deadline-exceeded","malformed"=>"invalid-response","timeout"=>"protocol-timeout",_=>"protocol-error"};
            Require(result.Terminal==expected,$"Wrong terminal for {mode}: {result.Terminal}");
            Require(now<=TimeSpan.FromSeconds(2),"Settlement exceeded its bounded deadline.");
            Require(records.Count>0&&records.All(row=>row.FinishedUtc>=row.StartedUtc),"Missing timestamped observations.");
            if(mode=="settles")Require(locks==4&&records.Count==8,"Busy replies or status observations were lost.");
        }
        Console.WriteLine("Detach settlement self-test passed: delayed synchronization, persistent busy, malformed reply, timeout and protocol failure.");
    }
}
