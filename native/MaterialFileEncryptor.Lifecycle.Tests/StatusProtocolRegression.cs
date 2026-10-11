using System.Collections.Concurrent;
using System.Diagnostics;
using System.Reflection;
using System.Text.Json;

internal static class StatusProtocolRegression
{
    internal static async Task Run()
    {
        var start=new ProcessStartInfo("dotnet"){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
        start.ArgumentList.Add(Assembly.Load("MaterialFileEncryptor.Host").Location);
        using var process=Process.Start(start)!;
        var lines=new ConcurrentQueue<string>();
        var reader=Task.Run(async()=>{string? line;while((line=await process.StandardOutput.ReadLineAsync())!=null)lines.Enqueue(line);});
        var errors=process.StandardError.ReadToEndAsync();
        await process.StandardInput.WriteLineAsync("{\"id\":1,\"method\":\"statusSummary\"}");
        await process.StandardInput.WriteLineAsync("{\"id\":2,\"method\":\"status\"}");
        await process.StandardInput.FlushAsync();
        await Task.Delay(4200);
        process.StandardInput.Close();
        await process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(15));await reader;
        if(process.ExitCode!=0)throw new Exception("Idle protocol child failed: "+await errors);
        var rows=lines.Select(line=>JsonSerializer.Deserialize<JsonElement>(line)).ToArray();
        var events=rows.Where(row=>row.TryGetProperty("event",out _)).ToArray();
        if(events.Length!=1||events[0].GetProperty("status").TryGetProperty("files",out _))throw new Exception("Idle child emitted repeated or full-inventory status events.");
        var summary=rows.Single(row=>row.TryGetProperty("id",out var id)&&id.ValueKind==JsonValueKind.Number&&id.GetInt32()==1).GetProperty("result");
        var legacy=rows.Single(row=>row.TryGetProperty("id",out var id)&&id.ValueKind==JsonValueKind.Number&&id.GetInt32()==2).GetProperty("result");
        if(summary.TryGetProperty("files",out _)||summary.GetProperty("fileCount").GetInt32()!=0||!legacy.TryGetProperty("files",out _))throw new Exception("Summary or legacy protocol shape changed.");
        Console.WriteLine("PASS actual helper emits one compact event and no unchanged idle events across four ticks");
    }
}
