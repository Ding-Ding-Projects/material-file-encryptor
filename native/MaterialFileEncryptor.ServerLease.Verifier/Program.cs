using MaterialFileEncryptor.Host;
using System.Security.Cryptography;
using System.Text.Json;
using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

internal static class Program
{
    private static void Assert(bool value,string message) { if (!value) throw new InvalidOperationException(message); }
    private static string Hash(string path) { using var file=File.OpenRead(path);return Convert.ToHexString(SHA256.HashData(file)).ToLowerInvariant(); }
    private static bool Blocked(Action action) { try { action();return false; } catch(IOException) { return true; } catch(UnauthorizedAccessException) { return true; } }
    private static void CreateJunction(string path,string target)
    {
        // Build a mount-point reparse buffer only for this new synthetic fixture directory.
        Directory.CreateDirectory(path);
        byte[] substitute=Encoding.Unicode.GetBytes("\\??\\"+target),print=Encoding.Unicode.GetBytes(target);
        byte[] buffer=new byte[16+substitute.Length+2+print.Length+2];
        void U16(int offset,int value) { BitConverter.GetBytes(checked((ushort)value)).CopyTo(buffer,offset); }
        BitConverter.GetBytes(0xA0000003u).CopyTo(buffer,0);
        U16(4,buffer.Length-8);U16(8,0);U16(10,substitute.Length);U16(12,substitute.Length+2);U16(14,print.Length);
        substitute.CopyTo(buffer,16);print.CopyTo(buffer,16+substitute.Length+2);
        using SafeFileHandle handle=CreateFile(path,0x40000000,0,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
        if(handle.IsInvalid)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        uint returned;
        if(!DeviceIoControl(handle,0x000900A4,buffer,(uint)buffer.Length,IntPtr.Zero,0,out returned,IntPtr.Zero))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    [DllImport("kernel32.dll",EntryPoint="CreateFileW",CharSet=CharSet.Unicode,SetLastError=true)]private static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool DeviceIoControl(SafeFileHandle handle,uint control,byte[] input,uint inputLength,IntPtr output,uint outputLength,out uint returned,IntPtr overlapped);
    public static int Main(string[] args)
    {
        if(args.Length==1&&args[0]=="--lifetime-child")return ExecutionLifetimeVerifier.Child();
        if(args.Length==2&&args[0]=="--lifetime-fixture-root")return ExecutionLifetimeVerifier.Run(args[1],false);
        if(args.Length==2&&args[0]=="--lifetime-negative-fixture-root")return ExecutionLifetimeVerifier.Run(args[1],true);
        if(!OperatingSystem.IsWindows() || args.Length!=2 || args[0]!="--fixture-root") return 2;
        string root=Path.GetFullPath(args[1]);
        if(root.IndexOfAny("&|<>^%!\"\r\n".ToCharArray())>=0)return 2;
        if(Directory.Exists(root)||File.Exists(root)) return 2;
        Directory.CreateDirectory(root);
        var checks=new List<string>();
        try
        {
            string server=Path.Combine(root,"owned"),runtime=Path.Combine(root,"runtime"),jar=Path.Combine(server,"server","server.jar"),exe=Path.Combine(runtime,"java.exe");
            Directory.CreateDirectory(Path.GetDirectoryName(jar));Directory.CreateDirectory(runtime);
            File.WriteAllText(jar,"synthetic jar, never executed");File.WriteAllText(exe,"synthetic runtime, never executed");
            string jarHash=Hash(jar),exeHash=Hash(exe);
            var lease=ServerFileLease.Acquire(server,jarHash,runtime,exe,exeHash);
            try
            {
                lease.AssertHeld();Assert(lease.Kind=="windows-deny-write-delete","Lease kind differs.");
                foreach(string file in new[]{jar,exe})
                {
                    using(var reader=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)) Assert(reader.ReadByte()>=0,"Read sharing failed.");
                    Assert(Blocked(()=>{using var writer=new FileStream(file,FileMode.Open,FileAccess.Write,FileShare.ReadWrite);}),"Writer admitted.");
                    Assert(Blocked(()=>File.Move(file,file+".moved")),"Rename admitted.");
                    Assert(Blocked(()=>File.Delete(file)),"Delete admitted.");
                }
                Assert(Blocked(()=>Directory.Move(server,server+"-moved")),"Owned root replacement admitted.");
                Assert(Blocked(()=>Directory.Move(runtime,runtime+"-moved")),"Runtime root replacement admitted.");
                Assert(Blocked(()=>Directory.Move(Path.GetDirectoryName(jar),Path.GetDirectoryName(jar)+"-moved")),"Nested directory replacement admitted.");
                checks.Add("held-files-and-ancestors");
                // Simulated unknown ownership does not trigger release: the native owner retains the lease.
                lease.AssertHeld();Assert(Blocked(()=>File.Delete(jar)),"Retained unknown ownership lost protection.");checks.Add("retained-unknown-ownership");
            }
            finally { lease.Release(); }
            lease.Release();bool released=false;try{lease.AssertHeld();}catch(InvalidOperationException){released=true;}Assert(released,"Released lease reports held.");
            using(var writer=new FileStream(jar,FileMode.Open,FileAccess.Write,FileShare.ReadWrite)){}checks.Add("explicit-idempotent-release");
            bool failed=false;try{ServerFileLease.Acquire(server,jarHash,runtime,exe,new string('0',64));}catch(InvalidDataException){failed=true;}Assert(failed,"Wrong runtime digest admitted.");
            using(var writer=new FileStream(jar,FileMode.Open,FileAccess.Write,FileShare.ReadWrite)){}
            using(var writer=new FileStream(exe,FileMode.Open,FileAccess.Write,FileShare.ReadWrite)){}
            Directory.Move(server,server+"-check");Directory.Move(server+"-check",server);checks.Add("partial-acquire-releases-owned-handles");
            using(var writer=new FileStream(exe,FileMode.Open,FileAccess.Write,FileShare.ReadWrite))
            {failed=false;try{ServerFileLease.Acquire(server,jarHash,runtime,exe,exeHash);}catch(System.ComponentModel.Win32Exception){failed=true;}Assert(failed,"Existing writer admitted.");}checks.Add("existing-writer-rejected");
            failed=false;try{ServerFileLease.Acquire(server,jarHash,Path.Combine(root,"outside"),exe,exeHash);}catch(ArgumentException){failed=true;}Assert(failed,"Runtime outside admission root accepted.");checks.Add("runtime-root-admission");
            string linked=Path.Combine(root,"linked-runtime");
            CreateJunction(linked,runtime);
            failed=false;try{ServerFileLease.Acquire(server,jarHash,linked,Path.Combine(linked,"java.exe"),exeHash);}catch(InvalidDataException){failed=true;}Assert(failed,"Junction runtime admitted.");checks.Add("junction-rejected");
            string mappedServer=Path.Combine(root,"mapped-owned"),mappedJar=Path.Combine(mappedServer,"server","server.jar");
            Directory.CreateDirectory(Path.GetDirectoryName(mappedJar));File.WriteAllText(mappedJar,"mapped fixture, never executed");string mappedHash=Hash(mappedJar);
            using(var original=new FileStream(mappedJar,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite|FileShare.Delete))
            using(var mapping=MemoryMappedFile.CreateFromFile(original,null,0,MemoryMappedFileAccess.ReadWrite,HandleInheritability.None,true))
            {
                original.Dispose();
                using var view=mapping.CreateViewAccessor(0,0,MemoryMappedFileAccess.ReadWrite);
                ServerFileLease mappedLease=null;
                try { mappedLease=ServerFileLease.Acquire(mappedServer,mappedHash,runtime,exe,exeHash); }
                catch(System.ComponentModel.Win32Exception) { checks.Add("preexisting-mapping-admission-rejected"); }
                if(mappedLease!=null)
                {
                    try
                    {
                        view.Write(0,(byte)'X');view.Flush();mappedLease.AssertHeld();
                        Assert(Hash(mappedJar)!=mappedHash,"Mapped mutation observation missing.");
                        checks.Add("preexisting-mapping-mutates-despite-held-sharing-lease");
                    }
                    finally {mappedLease.Release();}
                }
            }
            Assert(Hash(jar)==jarHash&&Hash(exe)==exeHash,"Fixture bytes changed.");
            File.WriteAllText(Path.Combine(root,"receipt.json"),JsonSerializer.Serialize(new{schemaVersion=1,status="passed",checks,verifierDllSha256=Hash(typeof(Program).Assembly.Location),dotnetHostSha256=Hash(Environment.ProcessPath),runtimeAcceptance="not-run",ipcIntegration="pending"}));
            Console.WriteLine("PASS: native server lease verifier; "+checks.Count+" synthetic boundaries. Fixtures retained.");return 0;
        }
        catch(Exception error)
        {
            File.WriteAllText(Path.Combine(root,"receipt.json"),JsonSerializer.Serialize(new{schemaVersion=1,status="failed",checks,errorType=error.GetType().Name,runtimeAcceptance="not-run",ipcIntegration="pending"}));
            Console.Error.WriteLine("Native server lease verification failed; retained receipt records the completed boundaries.");return 1;
        }
    }
}
