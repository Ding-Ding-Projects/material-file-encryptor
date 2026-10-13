using System.Diagnostics;
using System.IO.MemoryMappedFiles;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;

internal static class IsolatedMappedProbe
{
    internal static async Task Child(string path)
    {
        using var file=new FileStream(path,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite|FileShare.Delete);
        using var map=MemoryMappedFile.CreateFromFile(file,null,0,MemoryMappedFileAccess.ReadWrite,HandleInheritability.None,true);
        using var view=map.CreateViewAccessor();
        byte[] block=Enumerable.Repeat((byte)0x5a,65536).ToArray();
        view.WriteArray(0,block,0,block.Length);view.Flush();
        Console.WriteLine("READY");Console.Out.Flush();
        var stop=Task.Run(()=>Console.ReadLine());var elapsed=Stopwatch.StartNew();
        while(!stop.IsCompleted&&elapsed.Elapsed<TimeSpan.FromSeconds(15))
            for(long offset=65536;offset<4L*1024*1024&&!stop.IsCompleted;offset+=block.Length)view.WriteArray(offset,block,0,block.Length);
        Console.WriteLine("STOPPED");
        await Task.CompletedTask;
    }
    internal static async Task Run(string package,string output,string source,string expectedHash)
    {
        string helperPath=Path.Combine(Path.GetFullPath(package),"resources","native","MaterialFileEncryptor.Host.exe");
        string actualHash=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(helperPath)));
        if(!actualHash.Equals(expectedHash,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Helper hash mismatch.");
        string root=Path.Combine(Path.GetTempPath(),"mfe-isolated-mapped-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        string password=Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var evidence=new List<object>();string? drive=null;Process? child=null;Task<string>? errors=null;Task<string>? childOutput=null;
        using var stream=new MemoryStream();
        await using var helper=new MountedHelper(helperPath);
        try
        {
            var status=await helper.Call("status",new{});
            drive=status.GetProperty("availableDriveLetters").EnumerateArray().Select(x=>x.GetString()!).Last();
            if(DriveInfo.GetDrives().Any(x=>x.Name.StartsWith(drive,StringComparison.OrdinalIgnoreCase)))throw new IOException("Drive became occupied.");
            await helper.Call("create",new{storageDir=Path.Combine(root,"storage"),cacheDir=Path.Combine(root,"cache"),password,partSizeBytes=10485760});
            await helper.Call("mount",new{driveLetter=drive});
            string path=Path.Combine(drive+"\\","mapped.bin");
            using(var seed=File.Create(path)){seed.SetLength(4L*1024*1024);seed.Flush(true);}
            string host=Environment.ProcessPath!;var start=new ProcessStartInfo(host){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true};
            if(Path.GetFileNameWithoutExtension(host).Equals("dotnet",StringComparison.OrdinalIgnoreCase))start.ArgumentList.Add(Assembly.GetExecutingAssembly().Location);
            start.ArgumentList.Add("--mapped-child");start.ArgumentList.Add(path);
            child=Process.Start(start)!;errors=child.StandardError.ReadToEndAsync();
            string? ready=await child.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(20));
            evidence.Add(new{kind="writer",pid=child.Id,ready,startedUtc=child.StartTime.ToUniversalTime()});
            childOutput=child.StandardOutput.ReadToEndAsync();
            if(ready!="READY")throw new IOException("Writer did not confirm initial durable flush.");
            for(int attempt=0;attempt<3;attempt++)
            {
                var response=await helper.Call("forceLock",new{});evidence.Add(new{kind="forceLock",attempt,response});
                if(response.GetProperty("locked").GetBoolean())break;
            }
            if(!child.HasExited){try{await child.StandardInput.WriteLineAsync("stop");child.StandardInput.Close();}catch(IOException){}}
            using(var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(20)))await child.WaitForExitAsync(timeout.Token);
            evidence.Add(new{kind="writerExit",child.ExitCode,exitHex=unchecked((uint)child.ExitCode).ToString("X8"),stderr=await errors,stdout=await childOutput});
            var responsive=await helper.Call("statusSummary",new{});evidence.Add(new{kind="helper-responsive",status=responsive});
            if(Directory.Exists(drive+"\\"))evidence.Add(new{kind="finalForceLock",response=await helper.Call("forceLock",new{})});
            bool absent=!Directory.Exists(drive+"\\");evidence.Add(new{kind="mount-absence",absent});
            if(absent)
            {
                await helper.Call("unlock",new{storageDir=Path.Combine(root,"storage"),cacheDir=Path.Combine(root,"cache"),password,partSizeBytes=10485760});
                await helper.Call("mount",new{driveLetter=drive});
                byte[] bytes=new byte[65536];using(var verify=File.OpenRead(path))verify.ReadExactly(bytes);
                evidence.Add(new{kind="immediate-unlock",durablePrefixMatches=bytes.All(x=>x==0x5a),verifiedBytes=bytes.Length});
                evidence.Add(new{kind="terminalForceLock",response=await helper.Call("forceLock",new{})});
            }
        }
        catch(Exception error){evidence.Add(new{kind="collector-error",type=error.GetType().Name,hresult=error.HResult});}
        finally
        {
            if(child is not null&&!child.HasExited){child.Kill();await child.WaitForExitAsync();evidence.Add(new{kind="writer-timeout-terminated",child.ExitCode,stderr=errors is null?null:await errors});}
            if(drive is not null&&Directory.Exists(drive+"\\")){try{evidence.Add(new{kind="cleanup-forceLock",response=await helper.Call("forceLock",new{})});}catch(Exception error){evidence.Add(new{kind="cleanup-error",type=error.GetType().Name});}}
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(output))!);
            await File.WriteAllTextAsync(output,JsonSerializer.Serialize(new{source,helperSha256=actualHash,root,fixtureRetained=true,driveAbsent=drive is null||!Directory.Exists(drive+"\\"),evidence},new JsonSerializerOptions{WriteIndented=true}));
            child?.Dispose();password="";
        }
    }
}
