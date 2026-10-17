using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using Fsp;
using MaterialFileEncryptor.Core;

internal static class FilenameCaseRegression
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct FindData
    {
        public uint Attributes;
        public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
        public uint SizeHigh, SizeLow, Reserved0, Reserved1;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string Name;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 14)] public string AlternateName;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr FindFirstFileW(string path, out FindData data);
    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool FindClose(IntPtr handle);

    private static string ExactName(string path)
    {
        IntPtr handle = FindFirstFileW(path, out var data);
        if (handle == new IntPtr(-1)) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        try { return data.Name; }
        finally { FindClose(handle); }
    }

    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }

    internal static void Run(bool mounted = false)
    {
        string root = Path.Combine(Path.GetTempPath(), "mfe-filename-case-" + Guid.NewGuid().ToString("N"));
        var options = new VaultOptions { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache"), PartSizeBytes = 1048576 };
        using var credentials = VaultCredentials.Password("synthetic filename case fixture");
        var expected = new[] { "lowercase.txt", "MiXeD.Extension", "nestedFolder/innerDirectory/lowercase.log", "nestedFolder/innerDirectory/MiXeD.TXT" };
        string inputs = Path.Combine(root, "inputs");
        try
        {
            foreach (string path in expected)
            {
                string input = Path.Combine(inputs, path.Replace('/', Path.DirectorySeparatorChar));
                Directory.CreateDirectory(Path.GetDirectoryName(input)!);
                File.WriteAllText(input, "Synthetic copy fixture: " + path);
            }
            using (var engine = VaultEngine.Create(options, credentials))
            {
                var type = Assembly.Load("MaterialFileEncryptor.Host").GetType("MaterialFileEncryptor.Host.VaultFileSystem", true)!;
                var adapter = (FileSystemBase)Activator.CreateInstance(type, engine, new object())!;
                using (var host = mounted ? new FileSystemHost(adapter) : null)
                {
                    string? drive = null;
                    if (host is not null)
                    {
                        var occupied = DriveInfo.GetDrives().Select(value => char.ToUpperInvariant(value.Name[0])).ToHashSet();
                        drive = Enumerable.Range('D', 'Z' - 'D' + 1).Select(value => (char)value).Last(value => !occupied.Contains(value)) + ":";
                        Require(host.Preflight(drive) >= 0, "Synthetic mount preflight failed.");
                        Require(host.Mount(drive, null!, true, 0) >= 0, "Synthetic mount failed.");
                        Require(host.MountPoint() == drive, "Synthetic mount point differs from the reserved letter.");
                    }
                    foreach (string directory in new[] { "nestedFolder", "nestedFolder/innerDirectory" })
                        if (drive is null) engine.CreateDirectory(directory); else Directory.CreateDirectory(Path.Combine(drive + "\\", directory.Replace('/', '\\')));
                    Require(engine.GetInfo("")!.IsDirectory && engine.GetInfo("absent.txt") is null, "Root or missing-path lookup changed.");
                    foreach (string path in expected)
                    {
                        string input = Path.Combine(inputs, path.Replace('/', Path.DirectorySeparatorChar));
                        if (drive is null)
                        {
                            using var stage = engine.BeginImport(path);
                            stage.Write(0, File.ReadAllBytes(input)); stage.Commit();
                        }
                        else File.Copy(input, Path.Combine(drive + "\\", path.Replace('/', '\\')));
                    }
                    // Enumeration proves the encrypted namespace's stored spelling;
                    // exact-name queries exercise WinFsp's optimized lookup separately.
                    foreach (string path in expected)
                    {
                        string parent = path.Contains('/') ? path[..path.LastIndexOf('/')] : "";
                        string name = path[(path.LastIndexOf('/') + 1)..];
                        Require(engine.Enumerate(parent).Any(entry => entry.Path == path && entry.Name == name), "Stored filename case changed: " + path);
                        if (drive is not null)
                        {
                            string directory = Path.Combine(drive + "\\", parent.Replace('/', '\\'));
                            string found = Directory.EnumerateFiles(directory, name.ToUpperInvariant()).Single();
                            Require(Path.GetFileName(found) == name, "Mounted exact-name query changed filename case: " + name + " -> " + Path.GetFileName(found));
                            string exact = ExactName(Path.Combine(directory, name.ToUpperInvariant()));
                            Require(exact == name, "Mounted FindFirstFile query changed filename case: " + name + " -> " + exact);
                            Require(File.ReadAllText(found) == File.ReadAllText(Path.Combine(inputs, path.Replace('/', Path.DirectorySeparatorChar))), "Copied bytes changed.");
                        }
                        var metadata = engine.GetInfo(path.ToUpperInvariant())!;
                        Require(metadata.Path == path && metadata.Name == name, "Case-insensitive metadata lookup changed filename case: " + path + " -> " + metadata.Path);
                        var entries = (System.Collections.IDictionary)typeof(VaultEngine).GetField("entries", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(engine)!;
                        object entry = entries[path]!;
                        var cachedPath = entry.GetType().GetProperty("StoredPath", BindingFlags.Instance | BindingFlags.NonPublic)!;
                        Require((string?)cachedPath.GetValue(entry) == path, "Resolved spelling was not cached.");
                        Require(!JsonSerializer.Serialize(entry, entry.GetType()).Contains("StoredPath", StringComparison.OrdinalIgnoreCase), "Runtime filename cache entered serialized metadata.");
                        // A distinct string instance lets this check establish use of
                        // the warm cache without a machine-dependent time threshold.
                        string cachedSpelling = new(path.ToCharArray());
                        cachedPath.SetValue(entry, cachedSpelling);
                        Require(ReferenceEquals(engine.GetInfo(path.ToUpperInvariant())!.Path, cachedSpelling), "Warm metadata lookup scanned instead of using its cached spelling.");
                        Require(adapter.Open("\\" + path.ToUpperInvariant().Replace('/', '\\'), 0, 0, out var node, out var descriptor, out _, out var normalized) == 0, "Adapter open failed.");
                        try { Require(normalized == "\\" + path.Replace('/', '\\'), "Adapter open returned caller casing."); }
                        finally { adapter.Close(node, descriptor); }
                        Require(adapter.Open(parent, 0, 0, out node, out descriptor, out _, out _) == 0, "Parent adapter open failed.");
                        try
                        {
                            Require(adapter.GetDirInfoByName(node, descriptor, name.ToUpperInvariant(), out normalized, out _) == 0 && normalized == name, "Adapter directory query returned caller casing.");
                        }
                        finally { adapter.Close(node, descriptor); }
                    }
                    bool collision = false;
                    try
                    {
                        if (drive is null) engine.CreateFile("LOWERCASE.TXT");
                        else File.Copy(Path.Combine(inputs, "lowercase.txt"), drive + "\\LOWERCASE.TXT");
                    }
                    catch (IOException) { collision = true; }
                    Require(collision, "Case-insensitive duplicate was accepted.");
                    if (drive is not null)
                    {
                        File.Copy(Path.Combine(inputs, "MiXeD.Extension"), drive + "\\LOWERCASE.TXT", true);
                        Require(File.ReadAllText(drive + "\\lowercase.txt") == File.ReadAllText(Path.Combine(inputs, "MiXeD.Extension")), "Case-insensitive overwrite changed bytes.");
                    }
                    Require(engine.Enumerate("").Single(entry => entry.Path.Equals("lowercase.txt", StringComparison.OrdinalIgnoreCase)).Name == "lowercase.txt", "Collision or overwrite changed stored name.");
                    if (drive is null) engine.Rename("MiXeD.Extension", "mixed.extension");
                    else File.Move(drive + "\\MiXeD.Extension", drive + "\\mixed.extension");
                    Require(engine.GetInfo("MIXED.EXTENSION")!.Name == "mixed.extension", "Explicit case-only rename was lost.");
                    expected = expected.Select(path => path == "MiXeD.Extension" ? "mixed.extension" : path).ToArray();
                    foreach (string directory in new[] { "nestedFolder", "nestedFolder/innerDirectory" })
                    {
                        Require(engine.GetInfo(directory.ToUpperInvariant())!.Path == directory, "Directory metadata lookup changed stored case.");
                        if (drive is not null)
                            Require(ExactName(drive + "\\" + directory.ToUpperInvariant().Replace('/', '\\')) == directory[(directory.LastIndexOf('/') + 1)..], "Mounted directory query changed stored case.");
                    }
                    foreach (string destination in new[] { "NestedFOLDER", "renamedFolder" })
                    {
                        string current = expected.First(path => path.Contains('/')).Split('/')[0];
                        if (drive is null) engine.Rename(current, destination);
                        else Directory.Move(drive + "\\" + current, drive + "\\" + destination);
                        expected = expected.Select(path => path.StartsWith(current + "/", StringComparison.Ordinal) ? destination + path[current.Length..] : path).ToArray();
                        foreach (string path in expected.Where(path => path.Contains('/')))
                            Require(engine.GetInfo(path.ToUpperInvariant())!.Path == path, "Warmed descendant spelling was stale after directory rename.");
                        if (drive is not null)
                            Require(ExactName(drive + "\\" + destination.ToUpperInvariant()) == destination, "Renamed directory query retained stale spelling.");
                    }
                }
                engine.FlushAsync().GetAwaiter().GetResult();
            }
            using (var reopened = VaultEngine.Open(options, credentials))
            {
                foreach (string path in expected)
                    Require(reopened.GetInfo(path.ToUpperInvariant())!.Path == path, "Filename case changed after reopen: " + path);
            }
            Console.WriteLine("PASS " + (mounted ? "mounted copy and overwrite" : "core import and adapter") + " preserves filename case, nested paths, extensions, case-insensitive collisions, warmed-cache rename and reopen");
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
