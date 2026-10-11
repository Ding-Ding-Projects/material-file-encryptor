using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;

namespace MaterialFileEncryptor.Core;

// This journal proves durable progress only. It never publishes an unfinished file.
internal sealed class EncryptedImportJournal : IDisposable
{
    private const int HeaderSize=80,MaximumPlain=65000;
    private readonly FileStream stream;
    private readonly byte[] key;
    private readonly string domain;
    private byte[] previous=new byte[32];
    private long sequence;
    internal EncryptedImportJournal(string path,byte[] key,string domain)
    {
        this.key=key;this.domain=domain;
        stream=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read|FileShare.Delete,1,FileOptions.WriteThrough);
    }
    private static byte[] Mac(byte[] key,string domain,ReadOnlySpan<byte> header)
    {
        byte[] prefix=Encoding.UTF8.GetBytes(domain),input=new byte[prefix.Length+header.Length];
        prefix.CopyTo(input,0);header.CopyTo(input.AsSpan(prefix.Length));
        try{return HMACSHA256.HashData(key,input);}finally{CryptographicOperations.ZeroMemory(input);}
    }
    internal void Append(long length,long offset,int count,ReadOnlySpan<byte> tail)
    {
        using var budget=TransferBufferBudget.Reserve(3L*65536);
        byte[] payload=new byte[24+tail.Length];
        BinaryPrimitives.WriteInt64LittleEndian(payload,length);BinaryPrimitives.WriteInt64LittleEndian(payload.AsSpan(8),offset);
        BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(16),count);BinaryPrimitives.WriteInt32LittleEndian(payload.AsSpan(20),tail.Length);tail.CopyTo(payload.AsSpan(24));
        try
        {
            for(int start=0;start<payload.Length;start+=MaximumPlain)
            {
                long next=checked(sequence+1);byte[] encrypted=VaultCrypto.Seal(payload.AsSpan(start,Math.Min(MaximumPlain,payload.Length-start)),key,domain+"/"+next+"/"+Convert.ToHexString(previous));
                byte[] header=new byte[HeaderSize];"MFIP"u8.CopyTo(header);BinaryPrimitives.WriteInt64LittleEndian(header.AsSpan(4),next);BinaryPrimitives.WriteInt32LittleEndian(header.AsSpan(12),encrypted.Length);previous.CopyTo(header,16);Mac(key,domain,header.AsSpan(0,48)).CopyTo(header,48);
                stream.Write(header);stream.Write(encrypted);
                using var digest=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);digest.AppendData(header);digest.AppendData(encrypted);previous=digest.GetHashAndReset();sequence=next;
            }
            stream.Flush(true);
        }
        finally{CryptographicOperations.ZeroMemory(payload);}
    }
    internal static long Validate(string path,byte[] key,string domain)
    {
        using var budget=TransferBufferBudget.Reserve(3L*65536);
        using var input=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete,1);
        long sequence=0;byte[] previous=new byte[32];
        while(input.Position<input.Length)
        {
            if(input.Length-input.Position<HeaderSize)break;
            byte[] header=new byte[HeaderSize];input.ReadExactly(header);
            if(!header.AsSpan(0,4).SequenceEqual("MFIP"u8)||!CryptographicOperations.FixedTimeEquals(Mac(key,domain,header.AsSpan(0,48)),header.AsSpan(48)))throw new CryptographicException("Import journal header authentication failed.");
            long next=BinaryPrimitives.ReadInt64LittleEndian(header.AsSpan(4));int length=BinaryPrimitives.ReadInt32LittleEndian(header.AsSpan(12));
            if(next!=sequence+1||length<VaultCrypto.Overhead||length>MaximumPlain+VaultCrypto.Overhead||!CryptographicOperations.FixedTimeEquals(previous,header.AsSpan(16,32)))throw new CryptographicException("Import journal sequence is invalid.");
            if(input.Length-input.Position<length)break;
            byte[] encrypted=new byte[length];input.ReadExactly(encrypted);byte[] plain=VaultCrypto.Unseal(encrypted,key,domain+"/"+next+"/"+Convert.ToHexString(previous),MaximumPlain);
            CryptographicOperations.ZeroMemory(plain);
            using var digest=IncrementalHash.CreateHash(HashAlgorithmName.SHA256);digest.AppendData(header);digest.AppendData(encrypted);previous=digest.GetHashAndReset();sequence=next;
        }
        return sequence;
    }
    public void Dispose()=>stream.Dispose();
}
