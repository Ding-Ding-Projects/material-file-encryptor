using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using MaterialFileEncryptor.Core;

internal static class CngLegacyRegression
{
    internal static void Run()
    {
        foreach(int length in new[]{0,1,65535,65536,65537,200003,89999964})CheckLength(length);
        if(VaultEngine.LegacyReadBuffers.ActiveBytes!=0||VaultEngine.LegacyReadBuffers.PeakBytes>VaultEngine.LegacyReadBuffers.LimitBytes)throw new Exception("Legacy buffer accounting leaked or exceeded its bound.");
        if(TransferBufferBudget.Statistics.ActiveReservedBytes!=0)throw new Exception("Shared transfer reservation leaked.");
        using(TransferBufferBudget.Reserve(TransferBufferBudget.LimitBytes))
        {
            bool rejected=false;try{using var overflow=TransferBufferBudget.Reserve(1);}catch(IOException){rejected=true;}
            if(!rejected)throw new Exception("Shared transfer budget admitted excess bytes.");
        }
        Console.WriteLine($"PASS CNG legacy boundary/90,000,000-byte fixtures, tamper rejection and bounded workspace peak={VaultEngine.LegacyReadBuffers.PeakBytes}");
    }
    private static void CheckLength(int length)
    {
        string path=Path.Combine(Path.GetTempPath(),"mfe-cng-"+Guid.NewGuid().ToString("N")+".mfe");
        byte[] key=RandomNumberGenerator.GetBytes(32),plain=RandomNumberGenerator.GetBytes(length),blob=new byte[plain.Length+36];
        const string domain="mfe-v1/fixture/chunk/";
        try
        {
            "MFE1"u8.CopyTo(blob);BinaryPrimitives.WriteInt32LittleEndian(blob.AsSpan(4),plain.Length);RandomNumberGenerator.Fill(blob.AsSpan(8,12));
            using(var aes=new AesGcm(key,16))aes.Encrypt(blob.AsSpan(8,12),plain,blob.AsSpan(36),blob.AsSpan(20,16),Encoding.UTF8.GetBytes(domain));
            File.WriteAllBytes(path,blob);string hash=Convert.ToHexString(SHA256.HashData(blob));
            if(length==200003)
            {
                using var otherTransfer=TransferBufferBudget.Reserve(TransferBufferBudget.LimitBytes-131583);
                bool denied=false;try{CngLegacyRecord.Read(path,key,domain,hash,plain.Length,0,new byte[1]);}catch(IOException){denied=true;}
                if(!denied)throw new Exception("Legacy reader ignored another transfer's reserved budget.");
            }
            int count=Math.Min(65536,plain.Length),offset=Math.Max(0,plain.Length-count);
            byte[] actual=new byte[count];long allocated=GC.GetAllocatedBytesForCurrentThread();CngLegacyRecord.Read(path,key,domain,hash,plain.Length,offset,actual);allocated=GC.GetAllocatedBytesForCurrentThread()-allocated;
            if(!actual.AsSpan().SequenceEqual(plain.AsSpan(offset,actual.Length)))throw new Exception("CNG legacy range differs from independent AES-GCM fixture.");
            if(length>64*1024*1024&&allocated>1024*1024)throw new Exception("Large legacy authentication allocated a whole record.");
            actual.AsSpan().Fill(17);bool rejected=false;
            try{CngLegacyRecord.Read(path,key,domain+"wrong",hash,plain.Length,0,actual);}catch(CryptographicException){rejected=true;}
            if(!rejected||actual.Any(value=>value!=0))throw new Exception("Invalid AAD released plaintext.");
            void Reject(Action mutation,Action restore,string wrongHash)
            {
                mutation();actual.AsSpan().Fill(17);bool failed=false;
                try{CngLegacyRecord.Read(path,key,domain,wrongHash,plain.Length,offset,actual);}catch(Exception error) when(error is CryptographicException or IOException or InvalidDataException){failed=true;}
                finally{restore();}
                if(!failed||actual.Any(value=>value!=0))throw new Exception("Unauthenticated legacy data escaped.");
            }
            Reject(()=>{blob[20]^=1;File.WriteAllBytes(path,blob);},()=>{blob[20]^=1;File.WriteAllBytes(path,blob);},hash);
            Reject(()=>{using var truncated=new FileStream(path,FileMode.Open,FileAccess.Write);truncated.SetLength(blob.Length-1);},()=>File.WriteAllBytes(path,blob),hash);
            Reject(()=>{},()=>{},new string('0',64));
            if(length>0)Reject(()=>{blob[^1]^=1;File.WriteAllBytes(path,blob);},()=>{blob[^1]^=1;File.WriteAllBytes(path,blob);},hash);
            using(var packed=File.Create(path)){packed.Write(new byte[64]);packed.Write(blob);packed.Write(new byte[17]);}
            CngLegacyRecord.Read(path,key,domain,null,plain.Length,offset,actual,recordOffset:64);
            if(!actual.AsSpan().SequenceEqual(plain.AsSpan(offset,actual.Length)))throw new Exception("Packed legacy record offset changed plaintext.");
            File.WriteAllBytes(path,blob);
            if(length>64*1024*1024)
            {
                for(int cancelPass=0;cancelPass<2;cancelPass++)
                {
                    using var observedCancel=new CancellationTokenSource();byte[] discarded=new byte[131072];bool stopped=false;
                    try{CngLegacyRecord.Read(path,key,domain,hash,plain.Length,0,discarded,observedCancel.Token,(pass,position)=>{if(pass==cancelPass&&(pass==1||position==plain.Length))observedCancel.Cancel();});}
                    catch(OperationCanceledException){stopped=true;}
                    if(!stopped||discarded.Any(value=>value!=0))throw new Exception("Cancellation at pass boundary retained plaintext.");
                }
                using(var begin=new ManualResetEventSlim())
                {
                    var workers=Enumerable.Range(0,2).Select(_=>Task.Run(()=>{begin.Wait();byte[] part=new byte[65536];CngLegacyRecord.Read(path,key,domain,hash,plain.Length,plain.Length-part.Length,part);if(!part.AsSpan().SequenceEqual(plain.AsSpan(plain.Length-part.Length)))throw new Exception("Concurrent authentication changed bytes.");})).ToArray();
                    begin.Set();Task.WaitAll(workers);
                    if(VaultEngine.LegacyReadBuffers.PeakBytes<2*131584)throw new Exception("Concurrent workspace accounting did not observe both workers.");
                }
                using var cancel=new CancellationTokenSource();byte[] cancelled=new byte[65536];
                var task=Task.Run(()=>{try{CngLegacyRecord.Read(path,key,domain,hash,plain.Length,0,cancelled,cancel.Token);return false;}catch(OperationCanceledException){return true;}});
                if(!SpinWait.SpinUntil(()=>VaultEngine.LegacyReadBuffers.ActiveBytes>0,TimeSpan.FromSeconds(5)))throw new Exception("Large read did not start.");
                cancel.Cancel();if(!task.GetAwaiter().GetResult()||cancelled.Any(value=>value!=0))throw new Exception("Cancellation failed to discard legacy plaintext.");
            }
        }
        finally{CryptographicOperations.ZeroMemory(key);CryptographicOperations.ZeroMemory(plain);File.Delete(path);}
    }
}
