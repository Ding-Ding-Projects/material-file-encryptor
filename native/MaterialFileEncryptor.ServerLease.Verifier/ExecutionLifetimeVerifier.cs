#nullable enable
using System.ComponentModel;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text.Json;
using MaterialFileEncryptor.Host;

internal static class ExecutionLifetimeVerifier
{
    private static void Assert(bool value,string message){if(!value)throw new InvalidOperationException(message);}
    private static bool Blocked(Action action){try{action();return false;}catch(IOException){return true;}catch(UnauthorizedAccessException){return true;}}
    private static string Hash(string file){using var stream=File.OpenRead(file);return Convert.ToHexString(SHA256.HashData(stream)).ToLowerInvariant();}
    private sealed record Fixture(string Root,string Server,string Runtime,string Java,string Jar,string Dll,Dictionary<string,string> Members);
    private static Fixture Create(string root)
    {
        string server=Path.Combine(root,"server-owner"),runtime=Path.Combine(root,"runtime"),java=Path.Combine(runtime,"bin","java.exe"),dll=Path.Combine(runtime,"bin","server","jvm.dll"),jar=Path.Combine(server,"server","server.jar");
        Directory.CreateDirectory(Path.GetDirectoryName(java)!);Directory.CreateDirectory(Path.GetDirectoryName(dll)!);Directory.CreateDirectory(Path.GetDirectoryName(jar)!);Directory.CreateDirectory(Path.Combine(runtime,"legal"));
        File.WriteAllText(java,"synthetic file, never executed");File.WriteAllText(dll,"synthetic DLL, never loaded");File.WriteAllText(jar,"synthetic JAR, never executed");File.WriteAllText(Path.Combine(runtime,"legal","LICENSE"),"synthetic legal inventory member");
        var members=Directory.GetFiles(runtime,"*",SearchOption.AllDirectories).ToDictionary(file=>Path.GetRelativePath(runtime,file).Replace('\\','/'),Hash,StringComparer.Ordinal);
        return new Fixture(root,server,runtime,java,jar,dll,members);
    }
    private static ServerExecutionLease Acquire(Fixture fixture,string childExecutable,string? jarHash=null)
      =>ServerExecutionLease.AcquireSynthetic(fixture.Runtime,fixture.Members,fixture.Server,jarHash??Hash(fixture.Jar),fixture.Java,Hash(fixture.Java),childExecutable);
    private static ProcessStartInfo ChildStart(string host,string root)
    {
        var start=new ProcessStartInfo(host){UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,WorkingDirectory=root};
        start.ArgumentList.Add(typeof(ExecutionLifetimeVerifier).Assembly.Location);start.ArgumentList.Add("--lifetime-child");return start;
    }
    private static void Writable(string path){using var file=new FileStream(path,FileMode.Open,FileAccess.Write,FileShare.ReadWrite);}
    private static void StopFixture(ServerExecutionLease lease)
    {
        var child=lease.Child;if(child is null)return;
        if(!child.HasExited){child.StandardInput.WriteLine("stop");child.StandardInput.Flush();Assert(child.WaitForExit(10000),"Synthetic child did not exit normally.");}
        Assert(lease.ReleaseAfterExactExit(),"Exact synthetic child exit did not release protection.");
    }
    public static int Child()
    {
        Console.Out.WriteLine("ready");Console.Out.Flush();return Console.In.ReadLine()=="stop"?0:2;
    }
    public static int Run(string suppliedRoot,bool negative)
    {
        if(!OperatingSystem.IsWindows()||!Path.IsPathFullyQualified(suppliedRoot))return 2;string root=Path.GetFullPath(suppliedRoot);if(Directory.Exists(root)||File.Exists(root))return 2;Directory.CreateDirectory(root);
        string host=Environment.ProcessPath??throw new InvalidOperationException("Verified .NET host identity unavailable.");if(!String.Equals(Path.GetFileName(host),"dotnet.exe",StringComparison.OrdinalIgnoreCase))return 2;
        var checks=new List<string>();ServerExecutionLease? active=null;
        try
        {
            var partial=Create(Path.Combine(root,"partial"));bool rejected=false;try{Acquire(partial,host,new string('0',64));}catch(InvalidDataException){rejected=true;}Assert(rejected,"Partial acquisition admitted wrong JAR.");Writable(partial.Dll);Writable(partial.Jar);Directory.Move(partial.Runtime,partial.Runtime+"-moved");Directory.Move(partial.Runtime+"-moved",partial.Runtime);checks.Add("partial-acquisition-releases-full-tree");
            var before=Create(Path.Combine(root,"before"));var beforeLease=Acquire(before,host);beforeLease.ReleaseBeforeSpawn();Writable(before.Dll);Writable(before.Jar);checks.Add("proven-no-launch-release");
            var failed=Create(Path.Combine(root,"failed"));string missing=Path.Combine(failed.Root,"missing.exe");var failedLease=Acquire(failed,missing);rejected=false;try{failedLease.Start(new ProcessStartInfo(missing){UseShellExecute=false});}catch(Win32Exception){rejected=true;}Assert(rejected&&failedLease.Released&&failedLease.Child is null,"Proven CreateProcess failure did not release leases.");Writable(failed.Dll);Writable(failed.Jar);checks.Add("proven-createprocess-failure-release");
            var normal=Create(Path.Combine(root,"normal"));active=Acquire(normal,host);var child=active.Start(ChildStart(host,normal.Root));Assert(child.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)).GetAwaiter().GetResult()=="ready","Synthetic child handshake missing.");
            if(negative)active.DropRuntimeProtectionForNegativeControl();
            Assert(Blocked(()=>Writable(normal.Dll)),"Full-tree DLL writer admitted while the exact child is alive.");Assert(Blocked(()=>File.Move(normal.Dll,normal.Dll+".moved")),"Full-tree DLL rename admitted.");Assert(Blocked(()=>File.Delete(normal.Dll)),"Full-tree DLL delete admitted.");Assert(Blocked(()=>Directory.Move(Path.GetDirectoryName(normal.Dll)!,Path.GetDirectoryName(normal.Dll)+"-moved")),"Runtime ancestor replacement admitted.");Assert(Blocked(()=>Writable(Path.Combine(normal.Runtime,"legal","LICENSE"))),"Non-executable inventory writer admitted.");checks.Add("full-tree-protected-through-child-lifetime");
            rejected=false;try{active.ReleaseBeforeSpawn();}catch(InvalidOperationException){rejected=true;}Assert(rejected,"Live child allowed pre-spawn release.");Assert(!child.WaitForExit(25),"Synthetic child exited before stop.");active.AssertHeld();checks.Add("live-timeout-retains-complete-tree");StopFixture(active);Assert(active.Released,"Exact exit did not release every lease.");active=null;Writable(normal.Dll);Writable(normal.Jar);checks.Add("exact-child-exit-releases-complete-tree");
            var uncertain=Create(Path.Combine(root,"uncertain"));active=Acquire(uncertain,host);rejected=false;try{active.Start(ChildStart(host,uncertain.Root),_=>throw new InvalidOperationException("Synthetic identity observation failed."));}catch(InvalidOperationException){rejected=true;}Assert(rejected&&active.Child is not null&&!active.Released&&!active.IdentityVerified,"Post-spawn uncertainty lost the child or leases.");var uncertainChild=active.Child??throw new InvalidOperationException("Uncertain child unavailable.");Assert(uncertainChild.StandardOutput.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10)).GetAwaiter().GetResult()=="ready","Uncertain synthetic child missing.");Assert(Blocked(()=>Writable(uncertain.Dll)),"Post-spawn uncertainty released a runtime member.");rejected=false;try{active.AssertCanStop();}catch(InvalidOperationException){rejected=true;}Assert(rejected,"Unverified identity allowed production stop.");checks.Add("post-spawn-uncertainty-retains-full-tree");StopFixture(active);active=null;Writable(uncertain.Dll);checks.Add("uncertain-exact-exit-release");
            File.WriteAllText(Path.Combine(root,"lifetime-receipt.json"),JsonSerializer.Serialize(new {schemaVersion=1,status="passed",checks,javaExecution="not-run",serverExecution="not-run",nativeHostSha256=Hash(host),verifierDllSha256=Hash(typeof(ExecutionLifetimeVerifier).Assembly.Location)}));Console.WriteLine("PASS: native full runtime lifetime verifier");return 0;
        }
        catch(Exception error){File.WriteAllText(Path.Combine(root,"lifetime-receipt.json"),JsonSerializer.Serialize(new {schemaVersion=1,status="failed",checks,reason=error.Message,negativeControl=negative,javaExecution="not-run",serverExecution="not-run"}));Console.Error.WriteLine(error.Message);return 1;}
        finally { if(active is not null)StopFixture(active); }
    }
}
