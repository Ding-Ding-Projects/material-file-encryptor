using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
namespace MaterialFileEncryptor.Core;
internal static class VaultCrypto
{
    internal const int Overhead = 36;
    internal const int MaxMetadata = 32 * 1024 * 1024;
    internal static byte[] Derive(VaultCredentials credentials, Config config)
    {
        if (credentials.Kind != config.Kind) throw new CryptographicException("This vault requires a different credential type.");
        if (config.Iterations < 600000 || config.Iterations > 5000000 || config.Salt.Length != 32) throw new InvalidDataException("Invalid key derivation parameters.");
        return Rfc2898DeriveBytes.Pbkdf2(credentials.Bytes, config.Salt, config.Iterations, HashAlgorithmName.SHA256, 32);
    }
    internal static byte[] Seal(ReadOnlySpan<byte> plain, byte[] key, string domain)
    {
        var output = new byte[checked(plain.Length + Overhead)];
        "MFE1"u8.CopyTo(output); BinaryPrimitives.WriteInt32LittleEndian(output.AsSpan(4), plain.Length);
        RandomNumberGenerator.Fill(output.AsSpan(8, 12));
        using var aes = new AesGcm(key, 16);
        aes.Encrypt(output.AsSpan(8,12), plain, output.AsSpan(36), output.AsSpan(20,16), Encoding.UTF8.GetBytes(domain));
        return output;
    }
    internal static byte[] Unseal(ReadOnlySpan<byte> sealedBytes, byte[] key, string domain, int maximum)
    {
        if (sealedBytes.Length < Overhead || !sealedBytes[..4].SequenceEqual("MFE1"u8)) throw new InvalidDataException("Invalid encrypted record.");
        var length = BinaryPrimitives.ReadInt32LittleEndian(sealedBytes[4..]);
        if (length < 0 || length > maximum || sealedBytes.Length != length + Overhead) throw new InvalidDataException("Invalid encrypted record length.");
        var output = new byte[length];
        try { using var aes = new AesGcm(key,16); aes.Decrypt(sealedBytes.Slice(8,12), sealedBytes[36..], sealedBytes.Slice(20,16), output, Encoding.UTF8.GetBytes(domain)); return output; }
        catch { CryptographicOperations.ZeroMemory(output); throw; }
    }
    internal static byte[] Serialize<T>(T value) => JsonSerializer.SerializeToUtf8Bytes(value);
    internal static T Deserialize<T>(byte[] value) => JsonSerializer.Deserialize<T>(value) ?? throw new InvalidDataException("Missing metadata.");
    internal static byte[] ReadBounded(string path, long maximum)
    {
        ValidatePhysicalPath(path);
        using var stream = File.OpenRead(path);
        if (stream.Length > maximum || stream.Length > int.MaxValue) throw new InvalidDataException("Object exceeds permitted size.");
        var bytes = new byte[(int)stream.Length]; stream.ReadExactly(bytes); return bytes;
    }
    internal static void AtomicWrite(string path, ReadOnlySpan<byte> bytes)
    {
        ValidatePhysicalPath(path);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path)!);
        var temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try { using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { stream.Write(bytes); stream.Flush(true); } File.Move(temp, path, true); }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    internal static void ValidatePhysicalPath(string path)
    {
        if((File.Exists(path)||Directory.Exists(path)) && (File.GetAttributes(path)&FileAttributes.ReparsePoint)!=0)throw new ArgumentException("Vault storage and cache paths cannot use symbolic links or junctions.");
        for(var cursor=new DirectoryInfo(Path.GetDirectoryName(Path.GetFullPath(path))!);cursor!=null;cursor=cursor.Parent)
            if(cursor.Exists && (cursor.Attributes&FileAttributes.ReparsePoint)!=0)throw new ArgumentException("Vault storage and cache paths cannot use symbolic links or junctions.");
    }
}
