using System.Buffers.Binary;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace MaterialFileEncryptor.Core;

public readonly record struct LegacyBufferStatistics(long ActiveBytes,long PeakBytes,long LimitBytes);

internal static class CngLegacyRecord
{
    private const int BlockSize=65536, WorkspaceBytes=2*BlockSize+512;
    private const long Limit=TransferBufferBudget.LimitBytes;
    private static readonly object budget=new();
    private static long active,peak;
    internal static LegacyBufferStatistics Statistics {get{lock(budget)return new(active,peak,Limit);}}
    private static void Reserve(CancellationToken token){lock(budget){while(active+WorkspaceBytes>Limit){token.ThrowIfCancellationRequested();Monitor.Wait(budget,50);}token.ThrowIfCancellationRequested();active+=WorkspaceBytes;peak=Math.Max(peak,active);}}
    private static void Release(){lock(budget){active-=WorkspaceBytes;Monitor.PulseAll(budget);}}
    [StructLayout(LayoutKind.Sequential)]
    private struct AuthInfo
    {
        internal uint Size,Version;internal IntPtr Nonce;internal uint NonceLength;internal IntPtr Aad;internal uint AadLength;
        internal IntPtr Tag;internal uint TagLength;internal IntPtr Mac;internal uint MacLength,AadProcessed;
        internal ulong DataProcessed;internal uint Flags;
    }
    [DllImport("bcrypt.dll",CharSet=CharSet.Unicode)]private static extern int BCryptOpenAlgorithmProvider(out IntPtr handle,string algorithm,string? implementation,uint flags);
    [DllImport("bcrypt.dll",CharSet=CharSet.Unicode)]private static extern int BCryptSetProperty(IntPtr handle,string property,byte[] value,int length,uint flags);
    [DllImport("bcrypt.dll")]private static extern int BCryptGenerateSymmetricKey(IntPtr algorithm,out IntPtr key,IntPtr keyObject,int keyObjectSize,IntPtr secret,int secretSize,uint flags);
    [DllImport("bcrypt.dll")]private static extern int BCryptDecrypt(IntPtr key,IntPtr input,int inputSize,ref AuthInfo info,IntPtr iv,int ivSize,IntPtr output,int outputSize,out int result,uint flags);
    [DllImport("bcrypt.dll")]private static extern int BCryptDestroyKey(IntPtr key);
    [DllImport("bcrypt.dll")]private static extern int BCryptCloseAlgorithmProvider(IntPtr algorithm,uint flags);
    private static void Check(int status){if(status<0)throw new CryptographicException($"Authenticated legacy decryption failed (0x{status:X8}).");}
    private sealed class Pin(byte[] bytes):IDisposable
    {
        private GCHandle handle=GCHandle.Alloc(bytes,GCHandleType.Pinned);
        internal IntPtr Pointer=>handle.AddrOfPinnedObject();
        public void Dispose(){if(handle.IsAllocated)handle.Free();}
    }
    // Microsoft CNG owns the GCM implementation and chained authentication state.
    // Pass one authenticates into a bounded discard buffer. Pass two rereads the
    // same write-excluding file handle, releasing only previously authenticated data.
    internal static void Read(string path,byte[] key,string domain,string? expectedHash,int expectedLength,long offset,Span<byte> destination,CancellationToken token=default,Action<int,long>? observeBlock=null,long recordOffset=0)
    {
        if(!OperatingSystem.IsWindows())throw new PlatformNotSupportedException("Streaming legacy authentication requires Windows CNG.");
        if(key.Length!=32)throw new ArgumentException("A legacy record requires a 256-bit vault key.",nameof(key));
        if(Encoding.UTF8.GetByteCount(domain)>256)throw new ArgumentException("Legacy authentication domain exceeds its bound.",nameof(domain));
        using var sharedBudget=TransferBufferBudget.Reserve(WorkspaceBytes,token);
        Reserve(token);byte[]? input=null,output=null,nonce=null,tag=null,mac=null,iv=null,aad=null;
        IntPtr algorithm=IntPtr.Zero,keyHandle=IntPtr.Zero;
        try
        {
            input=new byte[BlockSize];output=new byte[BlockSize];nonce=new byte[12];tag=new byte[16];mac=new byte[16];iv=new byte[16];aad=Encoding.UTF8.GetBytes(domain);
            VaultCrypto.ValidatePhysicalPath(path);
            using var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read,1,FileOptions.SequentialScan);
            if(recordOffset<0||recordOffset>stream.Length-36)throw new InvalidDataException("Invalid legacy record offset.");
            stream.Position=recordOffset;byte[] header=new byte[36];stream.ReadExactly(header);int length=BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan(4));
            if(!header.AsSpan(0,4).SequenceEqual("MFE1"u8)||length<0||length>89999964||length!=expectedLength||recordOffset>stream.Length-length-36L||(expectedHash is not null&&(recordOffset!=0||stream.Length!=length+36L))||offset<0||offset>length||destination.Length>length-offset)throw new InvalidDataException("Invalid legacy record length.");
            header.AsSpan(8,12).CopyTo(nonce);header.AsSpan(20,16).CopyTo(tag);
            Check(BCryptOpenAlgorithmProvider(out algorithm,"AES",null,0));byte[] mode=Encoding.Unicode.GetBytes("ChainingModeGCM\0");Check(BCryptSetProperty(algorithm,"ChainingMode",mode,mode.Length,0));
            using var keyPin=new Pin(key);Check(BCryptGenerateSymmetricKey(algorithm,out keyHandle,IntPtr.Zero,0,keyPin.Pointer,key.Length,0));
            using var inputPin=new Pin(input);using var outputPin=new Pin(output);using var noncePin=new Pin(nonce);using var tagPin=new Pin(tag);using var macPin=new Pin(mac);using var ivPin=new Pin(iv);using var aadPin=new Pin(aad);
            for(int pass=0;pass<2;pass++)
            {
                if(pass==1&&destination.Length==0)break;
                stream.Position=recordOffset+36;Array.Clear(mac);Array.Clear(iv);
                var info=new AuthInfo{Size=(uint)Marshal.SizeOf<AuthInfo>(),Version=1,Nonce=noncePin.Pointer,NonceLength=12,Aad=aadPin.Pointer,AadLength=(uint)aad.Length,Tag=tagPin.Pointer,TagLength=16,Mac=macPin.Pointer,MacLength=16};
                using var hash=pass==0?IncrementalHash.CreateHash(HashAlgorithmName.SHA256):null;
                hash?.AppendData(header);long position=0;bool first=true;
                do
                {
                    token.ThrowIfCancellationRequested();int count=(int)Math.Min(BlockSize,length-position);stream.ReadExactly(input.AsSpan(0,count));hash?.AppendData(input,0,count);
                    bool last=position+count==length;info.Flags=last?info.Flags&~1u:info.Flags|1u;
                    Check(BCryptDecrypt(keyHandle,inputPin.Pointer,count,ref info,ivPin.Pointer,iv.Length,outputPin.Pointer,output.Length,out int written,0));
                    if(written!=count)throw new CryptographicException("Legacy decryption returned an incomplete block.");
                    if(pass==1)
                    {
                        long start=Math.Max(position,offset),end=Math.Min(position+count,offset+destination.Length);
                        if(end>start)output.AsSpan((int)(start-position),(int)(end-start)).CopyTo(destination[(int)(start-offset)..]);
                    }
                    CryptographicOperations.ZeroMemory(output);position+=count;
                    observeBlock?.Invoke(pass,position);
                    if(first){info.Aad=IntPtr.Zero;info.AadLength=0;first=false;}
                    if(pass==1&&position>=offset+destination.Length)break;
                }while(position<length);
                if(pass==0&&expectedHash is not null&&!Convert.ToHexString(hash!.GetHashAndReset()).Equals(expectedHash,StringComparison.OrdinalIgnoreCase))throw new CryptographicException("Legacy ciphertext hash mismatch.");
            }
        }
        catch{destination.Clear();throw;}
        finally
        {
            if(keyHandle!=IntPtr.Zero)BCryptDestroyKey(keyHandle);if(algorithm!=IntPtr.Zero)BCryptCloseAlgorithmProvider(algorithm,0);
            foreach(var bytes in new[]{input,output,nonce,tag,mac,iv,aad})if(bytes is not null)CryptographicOperations.ZeroMemory(bytes);Release();
        }
    }
}
