using System.Collections;
using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using MaterialFileEncryptor.Core;

internal sealed record CoreResult(long LegacyBytes,long AddedCiphertextBytes,double EditMilliseconds,long AllocatedBytes,bool DurabilityPassed,string AllocationScope);
internal static class CoreBenchmark
{
    static VaultOptions Options(string root)=>new(){StorageRoot=Path.Combine(root,"source"),CacheRoot=Path.Combine(root,"cache"),PartSizeBytes=10*1024*1024};
    internal static void CrashChild(string root)
    {
        using var credential=VaultCredentials.Password("core performance fixture only");
        var engine=VaultEngine.Open(Options(root),credential);engine.WriteRange("legacy.bin",2000000,new byte[]{91});engine.FlushLocalOnly();
        Environment.Exit(0);
    }
    internal static CoreResult Run(string root)
    {
        Directory.CreateDirectory(root);using var credential=VaultCredentials.Password("core performance fixture only");
        const int size=4*1024*1024;long added,allocated;double elapsed;
        using(var engine=VaultEngine.Create(Options(root),credential))
        {
            byte[] plain=new byte[size];RandomNumberGenerator.Fill(plain);byte[] encrypted=new byte[size+36],key=engine.ExportMasterKey();
            try
            {
                "MFE1"u8.CopyTo(encrypted);System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(encrypted.AsSpan(4),size);RandomNumberGenerator.Fill(encrypted.AsSpan(8,12));
                using var aes=new AesGcm(key,16);aes.Encrypt(encrypted.AsSpan(8,12),plain,encrypted.AsSpan(36),encrypted.AsSpan(20,16),Encoding.UTF8.GetBytes($"mfe-v1/{engine.VaultId}/chunk/"));
            }
            finally{CryptographicOperations.ZeroMemory(key);CryptographicOperations.ZeroMemory(plain);}
            string id=Convert.ToHexString(SHA256.HashData(encrypted));File.WriteAllBytes(Path.Combine(engine.CacheRoot,"parts",id+".mfe"),encrypted);
            engine.CreateFile("legacy.bin");
            var entries=(IDictionary)typeof(VaultEngine).GetField("entries",BindingFlags.Instance|BindingFlags.NonPublic)!.GetValue(engine)!;object entry=entries["legacy.bin"]!;var type=entry.GetType();
            type.GetProperty("Length")!.SetValue(entry,(long)size);type.GetProperty("ChunkSize")!.SetValue(entry,size);type.GetProperty("PartSize")!.SetValue(entry,(long)encrypted.Length);
            ((IDictionary)type.GetProperty("Records")!.GetValue(entry)!).Add(0L,Activator.CreateInstance(typeof(VaultEngine).Assembly.GetType("MaterialFileEncryptor.Core.RecordRef",true)!,id,0L,size,encrypted.Length,2));
            engine.FlushAsync().GetAwaiter().GetResult();
            long before=EncryptedBytes(engine.CacheRoot);long allocationBefore=GC.GetAllocatedBytesForCurrentThread();var watch=Stopwatch.StartNew();
            engine.WriteRange("legacy.bin",1000000,new byte[]{73});engine.FlushLocalOnly();watch.Stop();
            allocated=GC.GetAllocatedBytesForCurrentThread()-allocationBefore;elapsed=watch.Elapsed.TotalMilliseconds;added=EncryptedBytes(engine.CacheRoot)-before;
        }
        var start=new ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
        if(Path.GetFileNameWithoutExtension(Environment.ProcessPath)=="dotnet")start.ArgumentList.Add(typeof(CoreBenchmark).Assembly.Location);
        start.ArgumentList.Add("--core-crash");start.ArgumentList.Add(root);
        using(var child=Process.Start(start)!){if(!child.WaitForExit(30000)){child.Kill(true);throw new TimeoutException("Synthetic crash child exceeded deadline.");}if(child.ExitCode!=0)throw new IOException("Synthetic crash child failed.");}
        bool durable;
        using(var reopened=VaultEngine.Open(Options(root),credential)){byte[] first=new byte[1],second=new byte[1];reopened.ReadRange("legacy.bin",1000000,first);reopened.ReadRange("legacy.bin",2000000,second);durable=first[0]==73&&second[0]==91;}
        return new(size,added,elapsed,allocated,durable,"Current thread: legacy edit plus FlushLocalOnly, excluding fixture creation; native helper allocations unmeasured");
    }
    static long EncryptedBytes(string root)=>Directory.EnumerateFiles(root,"*.mfe",SearchOption.AllDirectories).Sum(path=>new FileInfo(path).Length);
}
