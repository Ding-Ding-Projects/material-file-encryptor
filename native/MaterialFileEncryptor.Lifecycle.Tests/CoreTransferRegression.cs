using System.Collections;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using MaterialFileEncryptor.Core;

internal static class CoreTransferRegression
{
    static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
    internal static void Run()
    {
        string root = Path.Combine(Path.GetTempPath(), "mfe-blocks-" + Guid.NewGuid().ToString("N"));
        var options = new VaultOptions { StorageRoot = Path.Combine(root, "source"), CacheRoot = Path.Combine(root, "cache"), PartSizeBytes = 200036 };
        Directory.CreateDirectory(root);
        using var credential = VaultCredentials.Password("block regression fixture only");
        try
        {
            using (var engine = VaultEngine.Create(options, credential))
            {
                byte[] content = RandomNumberGenerator.GetBytes(400000);
                using (var stage = engine.BeginImport("packed.bin"))
                {
                    stage.Write(0, content);
                    Assert(engine.GetInfo("packed.bin") is null, "Incomplete import became visible");
                    stage.Commit();
                }
                byte[] actual = new byte[content.Length]; engine.ReadRange("packed.bin", 0, actual);
                Assert(content.SequenceEqual(actual), "Packed blocks changed content");
                foreach (string path in Directory.GetFiles(options.CacheRoot + "/parts", "*.mfe"))
                {
                    byte[] bytes = File.ReadAllBytes(path); Assert(bytes.Length <= options.PartSizeBytes, "Part exceeds cap");
                    int offset = 0;
                    while (offset < bytes.Length)
                    {
                        int count = System.Buffers.Binary.BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(offset + 4));
                        Assert(count <= 65536, "Authenticated block exceeds 64 KiB"); offset += count + 36;
                    }
                    Assert(offset == bytes.Length, "Invalid record boundary");
                }
                // Equal-length block substitution must fail even though both
                // ciphertext records were produced by this vault's valid key.
                engine.CreateFile("binding.bin");
                engine.WriteRange("binding.bin", 0, RandomNumberGenerator.GetBytes(131072));
                var state = (IDictionary)typeof(VaultEngine).GetField("entries", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(engine)!;
                object binding = state["binding.bin"]!;
                var bindingRecords = (IDictionary)binding.GetType().GetProperty("Records")!.GetValue(binding)!;
                object firstRecord = bindingRecords[0L]!, secondRecord = bindingRecords[1L]!;
                string bindingPart = (string)firstRecord.GetType().GetProperty("Part")!.GetValue(firstRecord)!;
                string bindingPath = Path.Combine(options.CacheRoot, "parts", bindingPart + ".mfe");
                byte[] original = File.ReadAllBytes(bindingPath);
                void Rejected(byte[] changed)
                {
                    File.WriteAllBytes(bindingPath, changed);
                    bool rejected = false;
                    try { engine.ReadRange("binding.bin", 0, new byte[131072]); }
                    catch (Exception error) when (error is CryptographicException or InvalidDataException) { rejected = true; }
                    finally { File.WriteAllBytes(bindingPath, original); }
                    Assert(rejected, "Modified or substituted block was accepted");
                }
                byte[] swapped = original.ToArray();
                original.AsSpan(65572, 65572).CopyTo(swapped.AsSpan(0, 65572));
                original.AsSpan(0, 65572).CopyTo(swapped.AsSpan(65572, 65572));
                Rejected(swapped);
                byte[] tampered = original.ToArray(); tampered[40] ^= 1; Rejected(tampered);
                Rejected(original[..^1]);
                using (var discarded = engine.BeginImport("discarded.bin")) { discarded.Write(0, content.AsSpan(0, 32)); }
                Assert(engine.GetInfo("discarded.bin") is null, "Disposed stage became visible");

                using (var failedStage = engine.BeginImport("failed.bin"))
                {
                    failedStage.Write(0, new byte[] { 1, 2, 3 });
                    string checkpointPath = Path.Combine(options.CacheRoot, "journal.mfe");
                    string savedCheckpointPath = checkpointPath + ".saved";
                    File.Move(checkpointPath, savedCheckpointPath);
                    Directory.CreateDirectory(checkpointPath);
                    bool failed = false;
                    try { failedStage.Commit(); } catch (Exception error) when (error is IOException or UnauthorizedAccessException) { failed = true; }
                    finally { Directory.Delete(checkpointPath); File.Move(savedCheckpointPath, checkpointPath); }
                    Assert(failed && engine.GetInfo("failed.bin") is null, "Failed import remained live");
                }
                engine.FlushAsync().GetAwaiter().GetResult();
                using (var replicaCredentials = VaultCredentials.Password("block regression fixture only"))
                using (var replica = VaultEngine.Open(new VaultOptions { StorageRoot = options.StorageRoot, CacheRoot = Path.Combine(root,"replica") }, replicaCredentials))
                    Assert(replica.GetInfo("failed.bin") is null, "Failed import was later published");

                // Build an actual authenticated v2 record independently of the new
                // writer. This prevents a new-writer round trip masking old-reader regressions.
                byte[] legacy = RandomNumberGenerator.GetBytes(89999964), blob = new byte[90000000], key = engine.ExportMasterKey();
                try
                {
                    "MFE1"u8.CopyTo(blob); System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(blob.AsSpan(4), legacy.Length);
                    RandomNumberGenerator.Fill(blob.AsSpan(8, 12));
                    using var aes = new AesGcm(key, 16);
                    aes.Encrypt(blob.AsSpan(8, 12), legacy, blob.AsSpan(36), blob.AsSpan(20, 16), Encoding.UTF8.GetBytes($"mfe-v1/{engine.VaultId}/chunk/"));
                }
                finally { CryptographicOperations.ZeroMemory(key); }
                string id = Convert.ToHexString(SHA256.HashData(blob));
                File.WriteAllBytes(Path.Combine(options.CacheRoot, "parts", id + ".mfe"), blob);
                engine.CreateFile("legacy.bin");
                var entries = (IDictionary)typeof(VaultEngine).GetField("entries", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(engine)!;
                object entry = entries["legacy.bin"]!; var et = entry.GetType();
                et.GetProperty("Length")!.SetValue(entry, (long)legacy.Length); et.GetProperty("ChunkSize")!.SetValue(entry, legacy.Length); et.GetProperty("PartSize")!.SetValue(entry, (long)blob.Length);
                var records = (IDictionary)et.GetProperty("Records")!.GetValue(entry)!;
                Type rt = typeof(VaultEngine).Assembly.GetType("MaterialFileEncryptor.Core.RecordRef", true)!;
                records.Add(0L, Activator.CreateInstance(rt, id, 0L, legacy.Length, blob.Length, 2));
                long before = Directory.GetFiles(options.CacheRoot + "/parts", "*.mfe").Sum(path => new FileInfo(path).Length);
                long beforeAllocation=GC.GetAllocatedBytesForCurrentThread();
                engine.WriteRange("legacy.bin", 70000, new byte[] { 77 }); legacy[70000] = 77;
                long editAllocation=GC.GetAllocatedBytesForCurrentThread()-beforeAllocation;
                Assert(editAllocation<1024*1024,"One-byte legacy edit allocated a whole legacy record");
                Console.WriteLine($"Large legacy one-byte edit allocated={editAllocation}, authenticated workspace peak={VaultEngine.LegacyReadBuffers.PeakBytes}");
                long added = Directory.GetFiles(options.CacheRoot + "/parts", "*.mfe").Sum(path => new FileInfo(path).Length) - before;
                Assert(added < 10000, "First edit repacked entire legacy file");
                byte[] readLegacy = new byte[legacy.Length]; engine.ReadRange("legacy.bin", 0, readLegacy); Assert(legacy.SequenceEqual(readLegacy), "Legacy overlay changed unrelated bytes");
                string packedId=Guid.NewGuid().ToString("N");key=engine.ExportMasterKey();
                byte[] prefix=new byte[64];"MFE1"u8.CopyTo(prefix);System.Buffers.Binary.BinaryPrimitives.WriteInt32LittleEndian(prefix.AsSpan(4),28);RandomNumberGenerator.Fill(prefix.AsSpan(8,12));
                try{using var aes=new AesGcm(key,16);aes.Encrypt(blob.AsSpan(8,12),legacy,blob.AsSpan(36),blob.AsSpan(20,16),Encoding.UTF8.GetBytes($"mfe-v1/{engine.VaultId}/record/{packedId}:64"));aes.Encrypt(prefix.AsSpan(8,12),new byte[28],prefix.AsSpan(36),prefix.AsSpan(20,16),Encoding.UTF8.GetBytes($"mfe-v1/{engine.VaultId}/record/{packedId}:0"));}
                finally{CryptographicOperations.ZeroMemory(key);}
                using(var packed=File.Create(Path.Combine(options.CacheRoot,"parts",packedId+".mfe"))){packed.Write(prefix);packed.Write(blob);}
                engine.CreateFile("legacy-format1.bin");object packedEntry=entries["legacy-format1.bin"]!;
                et.GetProperty("Length")!.SetValue(packedEntry,(long)legacy.Length);et.GetProperty("ChunkSize")!.SetValue(packedEntry,legacy.Length);et.GetProperty("PartSize")!.SetValue(packedEntry,90000000L);
                ((IDictionary)et.GetProperty("Records")!.GetValue(packedEntry)!).Add(0L,Activator.CreateInstance(rt,packedId,64L,legacy.Length,blob.Length,1));
                beforeAllocation=GC.GetAllocatedBytesForCurrentThread();engine.WriteRange("legacy-format1.bin",1234,new byte[]{55});
                editAllocation=GC.GetAllocatedBytesForCurrentThread()-beforeAllocation;Assert(editAllocation<1024*1024,"Format1 edit allocated its whole record");
                byte[] format1Read=new byte[65536];engine.ReadRange("legacy-format1.bin",0,format1Read);legacy[1234]=55;
                Assert(format1Read.SequenceEqual(legacy.AsSpan(0,format1Read.Length).ToArray()),"Format1 overlay changed unrelated bytes");
                Console.WriteLine($"Large format1 one-byte edit allocated={editAllocation}");
                engine.SetLength("legacy.bin", 70001); engine.SetLength("legacy.bin", 90000);
                byte[] tail = new byte[19999]; engine.ReadRange("legacy.bin", 70001, tail); Assert(tail.All(value => value == 0), "Truncated legacy bytes reappeared");
                engine.SetPartSize(1024); engine.WriteRange("legacy.bin", 80000, new byte[] { 45 });
                engine.FlushAsync().GetAwaiter().GetResult();
            }
            using (var reopened = VaultEngine.Open(options, credential))
            {
                byte[] actual = new byte[1]; reopened.ReadRange("legacy.bin", 80000, actual); Assert(actual[0] == 45, "Overlay did not survive reopen");
                Assert(reopened.GetInfo("discarded.bin") is null, "Discarded stage replayed after reopen");
            }
            Console.WriteLine("PASS bounded authenticated packing, independent v2 fixture, lazy overlay, truncate/grow, staged import and reopen");
        }
        finally { Directory.Delete(root, true); }
    }
}
