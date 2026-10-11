using System.Reflection;
using MaterialFileEncryptor.Core;

internal static class RetainedHandleRegression
{
    internal static void Run()
    {
        string root = Path.Combine(Path.GetTempPath(), "mfe-retained-" + Guid.NewGuid().ToString("N"));
        using var credentials = VaultCredentials.Password("synthetic retained descriptor fixture");
        using var engine = VaultEngine.Create(new VaultOptions { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache"), PartSizeBytes = 1048576 }, credentials);
        using (var stage = engine.BeginImport("retained.bin")) { stage.Write(0, new byte[] { 1, 2, 3 }); stage.Commit(); }
        var type = Assembly.Load("MaterialFileEncryptor.Host").GetType("MaterialFileEncryptor.Host.VaultFileSystem", true)!;
        object fs = Activator.CreateInstance(type, engine, new object())!;
        var stopping = type.GetField("stopping", BindingFlags.Instance | BindingFlags.NonPublic)!;
        bool Begin() => (bool)type.GetMethod("BeginForceUnmount")!.Invoke(fs, null)!;
        object?[] Open()
        {
            object?[] values = { "retained.bin", 0u, 0u, null, null, null, null };
            if ((int)type.GetMethod("Open")!.Invoke(fs, values)! != 0) throw new Exception("Synthetic descriptor open failed.");
            return values;
        }
        void Close(object?[] values) => type.GetMethod("Close")!.Invoke(fs, new[] { values[3], values[4] });
        // Deterministically model the interval after Cleanup and before Close:
        // no callback is active, but a descriptor remains owned by a mapped view.
        var first = Open();
        type.GetMethod("Cleanup")!.Invoke(fs, new[] { first[3], first[4], "retained.bin", (object)0u });
        if (Begin() || (bool)stopping.GetValue(fs)!) throw new Exception("Retained descriptor admitted forced detach or stopped mounted admission.");
        var second = Open();
        if (Begin()) throw new Exception("Multiple retained descriptors admitted forced detach.");
        Close(first);
        if (Begin()) throw new Exception("One remaining descriptor admitted forced detach.");
        Close(second);
        if (!Begin()) throw new Exception("Released descriptors did not admit forced detach.");
        Console.WriteLine("PASS retained descriptors veto force unmount between callbacks until all descriptors close");
    }
}
