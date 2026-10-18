using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace MaterialFileEncryptor.Host;

internal static class VaultSessionPaths
{
    public static string Canonical(string value)
    {
        if (string.IsNullOrWhiteSpace(value)) throw new ArgumentException("Select a vault folder.");
        string full = Path.GetFullPath(value);
        if (OperatingSystem.IsWindows() && (full.StartsWith(@"\\?\", StringComparison.Ordinal) || full.StartsWith(@"\\.\", StringComparison.Ordinal)))
            throw new ArgumentException("Select an ordinary filesystem folder.");
        var missing = new Stack<string>();
        var cursor = new DirectoryInfo(full);
        string? existing = null;
        while (cursor is not null)
        {
            if (File.Exists(cursor.FullName)) throw new ArgumentException("A vault folder cannot be a file.");
            if (OperatingSystem.IsWindows() && (cursor.Name.EndsWith(' ') || cursor.Name.EndsWith('.')))
                throw new ArgumentException("Vault folder names cannot end in a space or period.");
            // Attribute lookup also detects a dangling symbolic link.
            try
            {
                if ((File.GetAttributes(cursor.FullName) & FileAttributes.ReparsePoint) != 0)
                    throw new ArgumentException("Vault folders cannot use symbolic links or junctions.");
            }
            catch (FileNotFoundException) { }
            catch (DirectoryNotFoundException) { }
            if (existing is null)
            {
                if (cursor.Exists) existing = OperatingSystem.IsWindows() ? WindowsFinalPath(cursor.FullName) : cursor.FullName;
                else missing.Push(cursor.Name);
            }
            cursor = cursor.Parent;
        }
        if (existing is null) throw new DirectoryNotFoundException("The selected folder's filesystem is unavailable.");
        while (missing.Count != 0) existing = Path.Combine(existing, missing.Pop());
        return Path.TrimEndingDirectorySeparator(existing);
    }
    public static bool Overlap(string first, string second) => Within(first, second) || Within(second, first);
    private static bool Within(string path, string root) => path.Equals(root, StringComparison.OrdinalIgnoreCase) ||
        path.StartsWith(Path.EndsInDirectorySeparator(root) ? root : root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    private static string WindowsFinalPath(string path)
    {
        using var handle = CreateFile(path, 0, 7, IntPtr.Zero, 3, 0x02000000, IntPtr.Zero);
        if (handle.IsInvalid) throw new IOException("The selected folder could not be identified.", new Win32Exception(Marshal.GetLastWin32Error()));
        var text = new StringBuilder(32768);
        uint length = GetFinalPathNameByHandle(handle, text, (uint)text.Capacity, 0);
        if (length == 0 || length >= text.Capacity) throw new IOException("The selected folder's final path is unavailable.");
        string result = text.ToString();
        if (result.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) return @"\\" + result[8..];
        return result.StartsWith(@"\\?\", StringComparison.Ordinal) ? result[4..] : result;
    }
    [DllImport("kernel32.dll", EntryPoint = "CreateFileW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFile(string path, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
    [DllImport("kernel32.dll", EntryPoint = "GetFinalPathNameByHandleW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle, StringBuilder text, uint length, uint flags);
}
