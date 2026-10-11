using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

internal static class Program
{
    private const long MemoryLimit = 268435456;
    private const int Timeout = 30000;
    private static int Main(string[] args)
    {
        string? nonce = null;
        try
        {
            if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException("Windows AppContainer is required.");
            if (args.Length != 2 || args[0] != "--request" || !Path.IsPathFullyQualified(args[1])) throw new ArgumentException("Expected --request followed by an absolute manifest path.");
            var manifestBytes = File.ReadAllBytes(args[1]);
            if (manifestBytes.Length > 65536) throw new ArgumentException("Manifest exceeds 64 KiB.");
            using var manifest = JsonDocument.Parse(manifestBytes);
            var m = manifest.RootElement;
            if (m.GetProperty("schema").GetInt32() != 1) throw new ArgumentException("Unsupported manifest schema.");
            nonce = m.GetProperty("nonce").GetString()!;
            if (nonce.Length is < 32 or > 128 || nonce.Any(c => !Uri.IsHexDigit(c))) throw new ArgumentException("Nonce must contain 32 to 128 hexadecimal characters.");
            if (m.GetProperty("timeoutMs").GetInt32() != Timeout || m.GetProperty("memoryBytes").GetInt64() != MemoryLimit) throw new ArgumentException("Resource limits cannot be changed.");
            return Run(m, nonce);
        }
        catch (Exception ex)
        {
            Console.WriteLine(JsonSerializer.Serialize(new { schema = 1, nonce, isolated = false, error = ex.GetType().Name, message = ex.Message, hresult = ex.HResult, nativeError = ex is Win32Exception win32 ? win32.NativeErrorCode : (int?)null }));
            return 1;
        }
    }

    private static string ExactPath(string value)
    {
        if (!Path.IsPathFullyQualified(value)) throw new ArgumentException("All sandbox paths must be absolute.");
        var full = Path.TrimEndingDirectorySeparator(Path.GetFullPath(value));
        for (var current = full; !string.IsNullOrEmpty(current); current = Path.GetDirectoryName(current))
            if (File.GetAttributes(current).HasFlag(FileAttributes.ReparsePoint)) throw new ArgumentException("Reparse points are not allowed.");
        return full;
    }

    private static bool Inside(string child, string root) => child.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);

    private static int Run(JsonElement m, string nonce)
    {
        var root = ExactPath(m.GetProperty("directory").GetString()!);
        var temporary = Path.TrimEndingDirectorySeparator(Path.GetFullPath(Path.GetTempPath()));
        if (!Inside(root, temporary)) throw new ArgumentException("Sandbox staging must be below the current temporary directory.");
        var payload = ExactPath(Path.Combine(root, "payload"));
        var work = ExactPath(Path.Combine(root, "work"));
        var runtime = ExactPath(m.GetProperty("runtime").GetString()!);
        var worker = ExactPath(m.GetProperty("worker").GetString()!);
        if (!Inside(runtime, payload) || !Inside(worker, payload) || !File.Exists(runtime) || !File.Exists(worker)) throw new ArgumentException("Runtime and worker must be staged within payload.");
        if (!Path.GetFileName(runtime).Equals("node.exe", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Only the staged Node runtime is supported.");
        var request = ExactPath(Path.Combine(work, "request.json"));
        var result = Path.Combine(work, "result.json");
        if (File.Exists(result) || Directory.Exists(result)) throw new ArgumentException("Result must not already exist.");
        var owner = WindowsIdentity.GetCurrent().User ?? throw new InvalidOperationException("Current user SID is unavailable.");
        var files = Directory.EnumerateFileSystemEntries(root, "*", SearchOption.AllDirectories).ToArray();
        if (files.Length > 10000) throw new ArgumentException("Too many staged files.");
        long bytes = 0;
        foreach (var path in files)
        {
            ExactPath(path);
            if (!Directory.Exists(path)) bytes += new FileInfo(path).Length;
            if (bytes > 256 * 1024 * 1024) throw new ArgumentException("Staged input exceeds 256 MiB.");
        }
        var profile = "mfe.converter." + Guid.NewGuid().ToString("N");
        IntPtr sid = IntPtr.Zero, job = IntPtr.Zero, attributes = IntPtr.Zero, capabilities = IntPtr.Zero, environment = IntPtr.Zero;
        Native.PROCESS_INFORMATION process = default;
        bool profileCreated = false, timedOut = false, killedForStorage = false, cancelled = false;
        uint finalExit = 1; string? finalHash = null;
        IntPtr log = IntPtr.Zero, input = IntPtr.Zero, handles = IntPtr.Zero, childPolicy = IntPtr.Zero;
        try
        {
            var hr = Native.CreateAppContainerProfile(profile, profile, "Isolated local conversion", IntPtr.Zero, 0, out sid);
            Marshal.ThrowExceptionForHR(hr);
            profileCreated = true;
            var appSid = new SecurityIdentifier(sid);
            SetAcl(root, owner, appSid, false);
            foreach (var path in files.OrderBy(p => p.Length)) SetAcl(path, owner, appSid, path.Equals(work, StringComparison.OrdinalIgnoreCase) || Inside(path, work));
            SetLowIntegrity(work);
            job = Native.CreateJobObject(IntPtr.Zero, null);
            Check(job != IntPtr.Zero);
            var limit = new Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limit.BasicLimitInformation.LimitFlags = 0x2000 | 0x8 | 0x100; // Kill on close, one process, process memory.
            limit.BasicLimitInformation.ActiveProcessLimit = 1;
            limit.ProcessMemoryLimit = (UIntPtr)MemoryLimit;
            Check(Native.SetInformationJobObject(job, 9, ref limit, (uint)Marshal.SizeOf<Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION>()));
            Check(Native.QueryInformationJobObject(job, 9, out var confirmedLimit, (uint)Marshal.SizeOf<Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION>(), IntPtr.Zero));
            if ((confirmedLimit.BasicLimitInformation.LimitFlags & 0x2108) != 0x2108 || confirmedLimit.BasicLimitInformation.ActiveProcessLimit != 1 || confirmedLimit.ProcessMemoryLimit.ToUInt64() != MemoryLimit) throw new InvalidOperationException("Job resource limits did not read back correctly.");
            nuint size = 0;
            Native.InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref size);
            attributes = Marshal.AllocHGlobal(checked((int)size));
            Check(Native.InitializeProcThreadAttributeList(attributes, 2, 0, ref size));
            var security = new Native.SECURITY_CAPABILITIES { AppContainerSid = sid };
            capabilities = Marshal.AllocHGlobal(Marshal.SizeOf<Native.SECURITY_CAPABILITIES>());
            Marshal.StructureToPtr(security, capabilities, false);
            Check(Native.UpdateProcThreadAttribute(attributes, 0, (IntPtr)0x20009, capabilities, (nuint)Marshal.SizeOf<Native.SECURITY_CAPABILITIES>(), IntPtr.Zero, IntPtr.Zero));
            var startup = new Native.STARTUPINFOEX();
            startup.StartupInfo.cb = Marshal.SizeOf<Native.STARTUPINFOEX>();
            startup.AttributeList = attributes;
            var sa = new Native.SECURITY_ATTRIBUTES { length = Marshal.SizeOf<Native.SECURITY_ATTRIBUTES>(), inherit = true };
            log = Native.CreateFile(Path.Combine(work, "worker.log"), 0x40000000, 3, ref sa, 2, 0x80, IntPtr.Zero);
            Check(log != new IntPtr(-1));
            input = Native.CreateFile("NUL", 0x80000000, 3, ref sa, 3, 0x80, IntPtr.Zero);
            Check(input != new IntPtr(-1));
            handles = Marshal.AllocHGlobal(IntPtr.Size * 2); Marshal.WriteIntPtr(handles, log); Marshal.WriteIntPtr(handles, IntPtr.Size, input);
            Check(Native.UpdateProcThreadAttribute(attributes, 0, (IntPtr)0x20002, handles, (nuint)(IntPtr.Size * 2), IntPtr.Zero, IntPtr.Zero));
            startup.StartupInfo.flags = 0x100;
            startup.StartupInfo.stdOutput = log; startup.StartupInfo.stdError = log;
            startup.StartupInfo.stdInput = input;
            var env = new SortedDictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["SystemRoot"] = Environment.GetEnvironmentVariable("SystemRoot") ?? @"C:\Windows",
                ["WINDIR"] = Environment.GetEnvironmentVariable("SystemRoot") ?? @"C:\Windows",
                ["TEMP"] = work, ["TMP"] = work, ["NODE_OPTIONS"] = "", ["NODE_PATH"] = ""
            };
            foreach (var name in new[] { "USERPROFILE", "LOCALAPPDATA", "APPDATA", "SystemDrive", "HOMEDRIVE", "HOMEPATH" })
                if (Environment.GetEnvironmentVariable(name) is string value) env[name] = value;
            environment = Marshal.StringToHGlobalUni(string.Join('\0', env.Select(kv => kv.Key + "=" + kv.Value)) + "\0\0");
            var command = new StringBuilder(string.Join(' ', new[] { runtime, "--preserve-symlinks", "--preserve-symlinks-main", worker, "--request", request, "--result", result, "--nonce", nonce }.Select(Quote)));
            Check(Native.CreateProcess(runtime, command, IntPtr.Zero, IntPtr.Zero, true, 0x00080000 | 0x00000004 | 0x08000000 | 0x00000400, environment, work, ref startup, out process));
            Check(Native.AssignProcessToJobObject(job, process.hProcess));
            VerifyToken(process.hProcess, appSid);
            if (Native.ResumeThread(process.hThread) == uint.MaxValue) throw new Win32Exception(Marshal.GetLastWin32Error());
            var timer = Stopwatch.StartNew();
            uint wait;
            while ((wait = Native.WaitForSingleObject(process.hProcess, 100)) == 258)
            {
                killedForStorage = StorageExceeded(work);
                timedOut = timer.ElapsedMilliseconds >= Timeout;
                cancelled = File.Exists(Path.Combine(work, "cancel.signal"));
                if (killedForStorage || timedOut || cancelled)
                {
                    Check(Native.TerminateJobObject(job, killedForStorage ? 126u : cancelled ? 125u : 124u));
                    Native.WaitForSingleObject(process.hProcess, 5000);
                    break;
                }
            }
            if (wait != 0 && wait != 258) throw new Win32Exception(Marshal.GetLastWin32Error());
            killedForStorage |= StorageExceeded(work);
            Check(Native.GetExitCodeProcess(process.hProcess, out var exitCode));
            string? resultHash = null;
            if (!timedOut && !killedForStorage && !cancelled && exitCode == 0)
            {
                ExactPath(result);
                if (new FileInfo(result).Length > 96 * 1024 * 1024) throw new InvalidDataException("Result exceeds the size limit.");
                var resultBytes = File.ReadAllBytes(result);
                using var response = JsonDocument.Parse(resultBytes);
                if (response.RootElement.GetProperty("nonce").GetString() != nonce) throw new InvalidDataException("Result nonce mismatch.");
                resultHash = Convert.ToHexString(SHA256.HashData(resultBytes)).ToLowerInvariant();
            }
            finalExit = exitCode; finalHash = resultHash;
        }
        finally
        {
            // Closing the job also kills a suspended worker when setup failed.
            if (process.hProcess != IntPtr.Zero) Native.TerminateProcess(process.hProcess, 125);
            if (job != IntPtr.Zero) Native.CloseHandle(job);
            if (process.hThread != IntPtr.Zero) Native.CloseHandle(process.hThread);
            if (process.hProcess != IntPtr.Zero) Native.CloseHandle(process.hProcess);
            if (attributes != IntPtr.Zero) { Native.DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); }
            if (capabilities != IntPtr.Zero) Marshal.FreeHGlobal(capabilities);
            if (environment != IntPtr.Zero) Marshal.FreeHGlobal(environment);
            if (log != IntPtr.Zero && log != new IntPtr(-1)) Native.CloseHandle(log);
            if (input != IntPtr.Zero && input != new IntPtr(-1)) Native.CloseHandle(input);
            if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
            if (childPolicy != IntPtr.Zero) Marshal.FreeHGlobal(childPolicy);
            if (sid != IntPtr.Zero) Native.FreeSid(sid);
            if (profileCreated)
            {
                var cleanup = Native.DeleteAppContainerProfile(profile);
                Marshal.ThrowExceptionForHR(cleanup);
            }
        }
        Console.WriteLine(JsonSerializer.Serialize(new { schema = 1, nonce, isolated = true, profile, exitCode = finalExit, timedOut, cancelled, killedForStorage, storageLimitBytes = MemoryLimit, resultSha256 = finalHash, profileDeleted = true, appContainerVerified = true, jobLimitsVerified = true, capabilityCount = 0, memoryBytes = MemoryLimit, timeoutMs = Timeout, activeProcessLimit = 1, networkCapabilities = 0 }));
        return timedOut || killedForStorage || cancelled || finalExit != 0 ? 1 : 0;
    }

    private static void SetAcl(string path, SecurityIdentifier owner, SecurityIdentifier container, bool writable)
    {
        var rights = writable ? FileSystemRights.Modify : FileSystemRights.ReadAndExecute;
        if (Directory.Exists(path))
        {
            var acl = new DirectorySecurity();
            acl.SetOwner(owner); acl.SetAccessRuleProtection(true, false);
            var inherit = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
            acl.AddAccessRule(new FileSystemAccessRule(owner, FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, inherit, PropagationFlags.None, AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(container, rights, inherit, PropagationFlags.None, AccessControlType.Allow));
            new DirectoryInfo(path).SetAccessControl(acl);
        }
        else
        {
            var acl = new FileSecurity();
            acl.SetOwner(owner); acl.SetAccessRuleProtection(true, false);
            acl.AddAccessRule(new FileSystemAccessRule(owner, FileSystemRights.FullControl, AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), FileSystemRights.FullControl, AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(container, rights, AccessControlType.Allow));
            new FileInfo(path).SetAccessControl(acl);
        }
    }

    private static void SetLowIntegrity(string path)
    {
        Check(Native.ConvertStringSecurityDescriptorToSecurityDescriptor("S:(ML;OICI;NW;;;LW)", 1, out var descriptor, out _));
        try
        {
            Check(Native.GetSecurityDescriptorSacl(descriptor, out var present, out var sacl, out _));
            if (!present) throw new InvalidOperationException("Integrity label missing.");
            uint error = Native.SetNamedSecurityInfo(path, 1, 0x10, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, sacl);
            if (error != 0) throw new Win32Exception((int)error);
        }
        finally { Native.LocalFree(descriptor); }
    }
    private static void Check(bool result) { if (!result) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    private static bool StorageExceeded(string root)
    {
        long bytes = 0; int count = 0;
        var pending = new Stack<string>(); pending.Push(root);
        while (pending.TryPop(out var directory))
        {
            foreach (var path in Directory.EnumerateFileSystemEntries(directory))
            {
                if (++count > 2000) return true;
                var attributes = File.GetAttributes(path);
                if (attributes.HasFlag(FileAttributes.ReparsePoint)) return true;
                if (attributes.HasFlag(FileAttributes.Directory)) pending.Push(path);
                else if ((bytes += new FileInfo(path).Length) > MemoryLimit) return true;
            }
        }
        return false;
    }
    private static void VerifyToken(IntPtr process, SecurityIdentifier expected)
    {
        Check(Native.OpenProcessToken(process, 8, out var token));
        try
        {
            foreach (int infoClass in new[] { 29, 30, 31 })
            {
                Native.GetTokenInformation(token, infoClass, IntPtr.Zero, 0, out uint needed);
                if (needed == 0 || needed > 1024 * 1024) throw new InvalidOperationException("Invalid token information size.");
                var data = Marshal.AllocHGlobal((int)needed);
                try
                {
                    Check(Native.GetTokenInformation(token, infoClass, data, needed, out _));
                    if (infoClass == 29 && Marshal.ReadInt32(data) != 1) throw new InvalidOperationException("Worker is not an AppContainer.");
                    if (infoClass == 30 && Marshal.ReadInt32(data) != 0) throw new InvalidOperationException("Worker unexpectedly has capabilities.");
                    if (infoClass == 31 && !new SecurityIdentifier(Marshal.ReadIntPtr(data)).Equals(expected)) throw new InvalidOperationException("Worker AppContainer SID differs from profile.");
                }
                finally { Marshal.FreeHGlobal(data); }
            }
        }
        finally { Native.CloseHandle(token); }
    }
    private static string Quote(string value)
    {
        var text = new StringBuilder("\"");
        int slashes = 0;
        foreach (char ch in value)
        {
            if (ch == '\\') { slashes++; continue; }
            text.Append('\\', ch == '"' ? slashes * 2 + 1 : slashes);
            text.Append(ch); slashes = 0;
        }
        text.Append('\\', slashes * 2); text.Append('"');
        return text.ToString();
    }
}
