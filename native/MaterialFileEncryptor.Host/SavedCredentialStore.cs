using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace MaterialFileEncryptor.Host;

internal static class SavedCredentialStore
{
    [StructLayout(LayoutKind.Sequential)] private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptProtectData(ref Blob input, string? description, ref Blob entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, ref Blob entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr memory);

    private static string Folder => System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MaterialFileEncryptor", "Credentials");
    private static string FileFor(string identity)
    {
        if (identity.Length != 32 || !identity.All(Uri.IsHexDigit)) throw new InvalidDataException("Invalid vault identity.");
        return System.IO.Path.Combine(Folder, identity + ".dpapi");
    }
    public static string ReadVaultIdentity(string storageDir, string cacheDir)
    {
        string path = System.IO.Path.Combine(storageDir, "vault.json");
        if (!File.Exists(path)) path = System.IO.Path.Combine(cacheDir, "vault.json");
        using var stream = File.OpenRead(path);
        if (stream.Length > 65536) throw new InvalidDataException("Invalid vault configuration.");
        using var document = JsonDocument.Parse(stream);
        string identity = document.RootElement.GetProperty("VaultId").GetString() ?? "";
        _ = FileFor(identity);
        return identity;
    }
    public static bool Exists(string identity) => OperatingSystem.IsWindows() && File.Exists(FileFor(identity));
    public static void Forget(string identity)
    {
        string path = FileFor(identity);
        if (File.Exists(path)) File.Delete(path);
    }
    public static void Save(string identity, byte[] masterKey)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Saved unlock is available on Windows.");
        var directory = Directory.CreateDirectory(Folder);
        var user = WindowsIdentity.GetCurrent().User ?? throw new InvalidOperationException("Windows user identity is unavailable.");
        var security = new DirectorySecurity();
        security.SetOwner(user);
        security.SetAccessRuleProtection(true, false);
        security.AddAccessRule(new FileSystemAccessRule(user, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        directory.SetAccessControl(security);
        byte[] protectedKey = Transform(masterKey, identity, true);
        string path = FileFor(identity), temp = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            using (var output = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { output.Write(protectedKey); output.Flush(true); }
            File.Move(temp, path, true);
        }
        finally { CryptographicOperations.ZeroMemory(protectedKey); if (File.Exists(temp)) File.Delete(temp); }
    }
    public static byte[] Load(string identity)
    {
        string path = FileFor(identity);
        using var stream = File.OpenRead(path);
        if (stream.Length is < 1 or > 8192) throw new InvalidDataException("Invalid saved unlock data.");
        var encrypted = new byte[(int)stream.Length]; stream.ReadExactly(encrypted);
        try
        {
            byte[] key = Transform(encrypted, identity, false);
            if (key.Length == 32) return key;
            CryptographicOperations.ZeroMemory(key);
            throw new CryptographicException("Saved unlock data is invalid.");
        }
        finally { CryptographicOperations.ZeroMemory(encrypted); }
    }
    private static unsafe byte[] Transform(byte[] value, string identity, bool protect)
    {
        byte[] extra = Encoding.UTF8.GetBytes("MaterialFileEncryptor/v1/" + identity);
        var input = new Blob { Length = value.Length, Data = Marshal.AllocHGlobal(value.Length) };
        var entropy = new Blob { Length = extra.Length, Data = Marshal.AllocHGlobal(extra.Length) };
        Blob output = default;
        try
        {
            Marshal.Copy(value, 0, input.Data, value.Length); Marshal.Copy(extra, 0, entropy.Data, extra.Length);
            bool success = protect ? CryptProtectData(ref input, "Material File Encryptor", ref entropy, IntPtr.Zero, IntPtr.Zero, 1, out output)
                : CryptUnprotectData(ref input, IntPtr.Zero, ref entropy, IntPtr.Zero, IntPtr.Zero, 1, out output);
            if (!success) throw new CryptographicException("Windows could not protect or unlock this credential for the current user.");
            if (output.Length is < 1 or > 8192) throw new CryptographicException("Windows returned invalid credential data.");
            var result = new byte[output.Length]; Marshal.Copy(output.Data, result, 0, result.Length); return result;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(new Span<byte>((void*)input.Data, input.Length)); Marshal.FreeHGlobal(input.Data);
            CryptographicOperations.ZeroMemory(new Span<byte>((void*)entropy.Data, entropy.Length)); Marshal.FreeHGlobal(entropy.Data);
            if (output.Data != IntPtr.Zero) { if (output.Length > 0) CryptographicOperations.ZeroMemory(new Span<byte>((void*)output.Data, output.Length)); LocalFree(output.Data); }
        }
    }
}
