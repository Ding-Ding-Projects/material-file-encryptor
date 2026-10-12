#nullable enable
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace MaterialFileEncryptor.Host
{
    // Trusted host callers provide session-owned roots and an independently admitted runtime.
    // This primitive does not discover, adopt or authorize a server or runtime by pathname.
    public sealed class ServerFileLease
    {
        private readonly object sync = new object();
        private readonly List<SafeFileHandle> handles = new List<SafeFileHandle>();
        private bool released;
        public string Kind { get { return "windows-deny-write-delete"; } }
        private ServerFileLease() { }
        internal static ServerFileLease AcquireDirectoryScope(string root)
        {
            var lease=new ServerFileLease();try{lease.PinDirectories(Canonical(root));return lease;}catch{lease.Release();throw;}
        }
        internal void HoldDirectory(string directory) { lock(sync){AssertHeld();PinDirectories(Canonical(directory));} }
        internal static ServerFileLease AcquireRuntimeInventory(string runtimeRoot, IReadOnlyDictionary<string, string> files)
        {
            string root = Canonical(runtimeRoot);var lease = new ServerFileLease();
            try
            {
                foreach(var item in files)
                {
                    string file=Canonical(Path.Combine(root,item.Key));
                    if(!file.StartsWith(root+"\\",StringComparison.OrdinalIgnoreCase))throw new ArgumentException("Runtime member must remain inside its owned root.");
                    ValidateDigest(item.Value);lease.PinDirectories(Path.GetDirectoryName(file) ?? throw new ArgumentException("Runtime member must have an owning directory."));lease.PinFile(file,item.Value);
                }
                lease.AssertHeld();return lease;
            }
            catch { lease.Release();throw; }
        }

        public static ServerFileLease Acquire(string ownedServerRoot, string jarSha256, string admittedRuntimeRoot, string runtimeExecutable, string runtimeSha256)
        {
            if (Environment.OSVersion.Platform != PlatformID.Win32NT) throw new PlatformNotSupportedException();
            string server = Canonical(ownedServerRoot), runtimeRoot = Canonical(admittedRuntimeRoot), executable = Canonical(runtimeExecutable);
            string jar = Path.Combine(server, "server", "server.jar");
            if (!executable.StartsWith(runtimeRoot.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Runtime must be inside its admitted root.");
            ValidateDigest(jarSha256); ValidateDigest(runtimeSha256);
            var lease = new ServerFileLease();
            try
            {
                lease.PinDirectories(Path.GetDirectoryName(jar) ?? throw new ArgumentException("Server distribution must have an owning directory."));
                lease.PinDirectories(Path.GetDirectoryName(executable) ?? throw new ArgumentException("Runtime executable must have an owning directory."));
                lease.PinFile(jar, jarSha256);
                lease.PinFile(executable, runtimeSha256);
                lease.AssertHeld();
                return lease;
            }
            catch { lease.Release(); throw; }
        }

        private static string Canonical(string path)
        {
            if (String.IsNullOrWhiteSpace(path) || path.Length < 3 || path[1] != ':' || path[2] != '\\' || path.IndexOf(':', 2) >= 0) throw new ArgumentException("A local absolute path is required.");
            string full = Path.GetFullPath(path);
            if (!Path.IsPathRooted(path) || full.Length < 3 || full[1] != ':' || full[2] != '\\') throw new ArgumentException("A local absolute path is required.");
            return full.TrimEnd('\\');
        }
        private static void ValidateDigest(string digest)
        {
            if (digest == null || digest.Length != 64) throw new ArgumentException("An admitted SHA-256 is required.");
            foreach (char c in digest) if (!(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f')) throw new ArgumentException("An admitted SHA-256 is required.");
        }
        private void PinDirectories(string directory)
        {
            var paths = new Stack<string>();
            string? cursor = directory;
            while (!String.IsNullOrEmpty(cursor)) { paths.Push(cursor); cursor = Path.GetDirectoryName(cursor); }
            while (paths.Count != 0)
            {
                string path = paths.Pop();
                // Permit directory content writes, but deny renaming/deleting every ancestor.
                SafeFileHandle handle = Open(path, 0, 3, 0x02200000);
                try { ValidateHandle(handle, path, true); handles.Add(handle); }
                catch { handle.Dispose(); throw; }
            }
        }
        private void PinFile(string path, string expected)
        {
            // Read sharing alone rejects existing writers and prevents later writes/deletes.
            SafeFileHandle handle = Open(path, 0x80000000, 1, 0x00200000);
            try
            {
                ValidateHandle(handle, path, false);
                // The stream owns this handle after construction; keep it open for the lease lifetime.
                using (var stream = new FileStream(handle, FileAccess.Read, 65536, false))
                using (var hash = SHA256.Create())
                {
                    string actual = BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
                    if (!String.Equals(actual, expected, StringComparison.Ordinal)) throw new InvalidDataException("Admitted file bytes changed.");
                    // Duplicate the protected file handle before the hashing stream closes it.
                    SafeFileHandle retained;
                    if (!DuplicateHandle(GetCurrentProcess(), handle, GetCurrentProcess(), out retained, 0, false, 2)) throw new Win32Exception(Marshal.GetLastWin32Error());
                    handles.Add(retained);
                }
            }
            catch { handle.Dispose(); throw; }
        }
        private static SafeFileHandle Open(string path, uint access, uint share, uint flags)
        {
            SafeFileHandle handle = CreateFile(path, access, share, IntPtr.Zero, 3, flags, IntPtr.Zero);
            if (handle.IsInvalid) { int error = Marshal.GetLastWin32Error(); handle.Dispose(); throw new Win32Exception(error); }
            return handle;
        }
        private static void ValidateHandle(SafeFileHandle handle, string expected, bool directory)
        {
            FileInformation info;
            if (!GetFileInformationByHandle(handle, out info)) throw new Win32Exception(Marshal.GetLastWin32Error());
            if ((info.Attributes & 0x400) != 0 || ((info.Attributes & 0x10) != 0) != directory || (!directory && info.Links != 1)) throw new InvalidDataException("Linked or unexpected file type is not admitted.");
            var text = new StringBuilder(32768);
            uint length = GetFinalPathNameByHandle(handle, text, (uint)text.Capacity, 0);
            if (length == 0 || length >= text.Capacity) throw new IOException("Final handle path is unavailable.");
            string actual = text.ToString();
            if (actual.StartsWith("\\\\?\\", StringComparison.Ordinal)) actual = actual.Substring(4);
            if (!String.Equals(actual.TrimEnd('\\'), expected.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Handle path differs from the admitted path.");
        }
        public void AssertHeld()
        {
            lock (sync)
            {
                if (released) throw new InvalidOperationException("The native file lease has been released.");
                foreach (SafeFileHandle handle in handles)
                {
                    FileInformation info;
                    if (handle.IsClosed || handle.IsInvalid || !GetFileInformationByHandle(handle, out info)) throw new InvalidOperationException("Native file lease ownership is unavailable.");
                }
            }
        }
        // The trusted lifecycle owner calls this only on proven pre-spawn failure or exact process exit.
        // Unknown ownership and timeouts retain this object and its handles; there is no timer release.
        public void Release()
        {
            lock (sync)
            {
                if (released) return;
                foreach (SafeFileHandle handle in handles) handle.Dispose();
                handles.Clear(); released = true;
            }
        }
        [StructLayout(LayoutKind.Sequential)] private struct FileInformation
        {
            public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [DllImport("kernel32.dll", EntryPoint="CreateFileW", CharSet=CharSet.Unicode, SetLastError=true)] private static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
        [DllImport("kernel32.dll", SetLastError=true)] private static extern bool GetFileInformationByHandle(SafeFileHandle handle,out FileInformation information);
        [DllImport("kernel32.dll", EntryPoint="GetFinalPathNameByHandleW", CharSet=CharSet.Unicode, SetLastError=true)] private static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder text,uint length,uint flags);
        [DllImport("kernel32.dll")] private static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll", SetLastError=true)] private static extern bool DuplicateHandle(IntPtr sourceProcess,SafeFileHandle source,IntPtr targetProcess,out SafeFileHandle target,uint access,bool inherit,uint options);
    }
}
