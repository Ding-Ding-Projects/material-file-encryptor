using System.Text;

internal sealed record ChildDiagnosticResult(string retainedText,long observedCharacters,bool truncated,bool drainTimedOut,string? readError);

internal sealed class ChildDiagnostics
{
    private readonly object gate=new();
    private readonly StringBuilder text=new();
    private long characters;
    private string? error;
    private readonly Task pump;
    internal ChildDiagnostics(TextReader reader) { pump=Read(reader); }
    private async Task Read(TextReader reader)
    {
        try
        {
            char[] buffer=new char[1024];int count;
            while((count=await reader.ReadAsync(buffer.AsMemory()))!=0)
            {
                lock(gate)
                {
                    characters+=count;
                    int retain=Math.Min(count,16384-text.Length);
                    if(retain>0)text.Append(buffer,0,retain);
                }
            }
        }
        catch(Exception failure){lock(gate)error=failure.GetType().Name;}
    }
    internal async Task<ChildDiagnosticResult> Finish(TimeSpan timeout)
    {
        bool drainTimedOut=false;
        try{await pump.WaitAsync(timeout);}catch(TimeoutException){drainTimedOut=true;}
        lock(gate)return new(text.ToString(),characters,characters>text.Length,drainTimedOut,error);
    }
    internal static async Task SelfTest()
    {
        var bounded=new ChildDiagnostics(new StringReader(new string('x',40000)));
        var result=System.Text.Json.JsonSerializer.SerializeToElement(await bounded.Finish(TimeSpan.FromSeconds(1)));
        if(result.GetProperty("retainedText").GetString()!.Length!=16384||result.GetProperty("observedCharacters").GetInt64()!=40000||!result.GetProperty("truncated").GetBoolean()||result.GetProperty("drainTimedOut").GetBoolean())throw new Exception("Child diagnostics exceeded retention bound or lost truncation state.");
        var blocked=new ChildDiagnostics(new BlockedReader());
        result=System.Text.Json.JsonSerializer.SerializeToElement(await blocked.Finish(TimeSpan.FromMilliseconds(25)));
        if(!result.GetProperty("drainTimedOut").GetBoolean())throw new Exception("Child diagnostic drain timeout was not retained.");
        Console.WriteLine("PASS child diagnostics retain at most 16384 characters per stream and preserve truncation and drain timeout");
    }
    private sealed class BlockedReader:TextReader
    {
        public override ValueTask<int> ReadAsync(Memory<char> buffer,CancellationToken cancellationToken=default)=>new(new TaskCompletionSource<int>().Task);
    }
}
