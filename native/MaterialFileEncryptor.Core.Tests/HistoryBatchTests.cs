using MaterialFileEncryptor.Core;
using System.Text;

internal static class HistoryBatchTests
{
    private static void Require(bool value,string message){if(!value)throw new Exception(message);}
    internal static void Run()=>RunAsync().GetAwaiter().GetResult();
    private static async Task RunAsync()
    {
        string root=Path.Combine(Path.GetTempPath(),"mfe-history-batches-"+Guid.NewGuid().ToString("N"));
        string source=Path.Combine(root,"source");Directory.CreateDirectory(Path.Combine(source,"parts"));Directory.CreateDirectory(Path.Combine(source,"commits"));
        try
        {
            var runner=new CountingRunner();var history=new GitVaultHistory(source,Path.Combine(root,"history"),runner,65536);
            var parts=Enumerable.Range(0,130).Select(_=>"parts/"+Guid.NewGuid().ToString("N")+".mfe").ToArray();
            foreach(var path in parts)File.WriteAllBytes(Path.Combine(source,path),Enumerable.Repeat((byte)42,512).ToArray());
            string metadata="commits/"+Guid.NewGuid().ToString("N")+".mfe";File.WriteAllBytes(Path.Combine(source,metadata),[1,2,3]);
            var paths=parts.Append(metadata).ToArray();string head=(await history.RecordSnapshotAsync(paths))!;
            Require(runner.HashCalls==3,"History hashing still launches one child per path.");
            Require(runner.IndexCalls<=9,"History indexing still launches one child per tree entry.");
            Require((await history.ReadEncryptedFileAsync(head,parts[129])).SequenceEqual(Enumerable.Repeat((byte)42,512)),"Batched index omitted the final part.");
            Require((await history.ReadEncryptedFileAsync(head,metadata)).SequenceEqual(new byte[]{1,2,3}),"Final metadata snapshot is missing.");
            var snapshots=await history.ListSnapshotsAsync();
            foreach(var snapshot in snapshots.Skip(1))
            {
                var tree=await runner.Inner.RunAsync("git",["ls-tree","-r","--name-only",snapshot],history.HistoryRoot);
                Require(!tree.Text.Contains(metadata,StringComparison.Ordinal),"Metadata preceded the part-only publication batches.");
            }
            runner.Reset();Require(await history.RecordSnapshotAsync(paths)==null,"Unchanged history created a snapshot.");
            Require(runner.HashCalls==3&&runner.IndexCalls==0,"Unchanged history did not retain bounded hashing and zero index publication.");
            File.WriteAllBytes(Path.Combine(source,parts[0]),[9]);
            try{await history.RecordSnapshotAsync(paths);throw new Exception("Immutable ciphertext mutation was accepted.");}catch(InvalidDataException){}
            Require((await history.ListSnapshotsAsync()).First()==head,"Collision changed the acknowledged history head.");
            File.WriteAllBytes(Path.Combine(source,parts[0]),Enumerable.Repeat((byte)42,512).ToArray());
            string extra="parts/"+Guid.NewGuid().ToString("N")+".mfe";File.WriteAllBytes(Path.Combine(source,extra),[7]);
            using var cancel=new CancellationTokenSource();runner.AfterHash=()=>cancel.Cancel();
            try{await history.RecordSnapshotAsync(paths.Append(extra),cancel.Token);throw new Exception("Cancelled hash batch published a snapshot.");}catch(OperationCanceledException){}
            runner.AfterHash=null;Require((await history.ListSnapshotsAsync()).First()==head,"Cancelled hash batch moved the history head.");
            runner.InvalidHashResponse=true;
            try{await history.RecordSnapshotAsync([extra]);throw new Exception("Malformed hash batch output was accepted.");}catch(InvalidDataException){}
            runner.InvalidHashResponse=false;
            Require(await history.RecordSnapshotAsync(paths.Append(extra))!=null,"Cancelled history did not resume.");
            Console.WriteLine("History batch evidence: 131 paths, 3 hash children, bounded index children, unchanged/collision/cancellation/malformed-output checks.");
        }
        finally
        {
            string ownedRoot=Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
            foreach(var file in Directory.GetFiles(root,"*",SearchOption.AllDirectories))
            {
                if(!Path.GetFullPath(file).StartsWith(ownedRoot,StringComparison.OrdinalIgnoreCase))throw new IOException("Fixture cleanup escaped its owned root.");
                File.SetAttributes(file,File.GetAttributes(file)&~FileAttributes.ReadOnly);
            }
            Directory.Delete(root,true);
        }
    }
    private sealed class CountingRunner:IVaultProcessRunner
    {
        internal readonly VaultProcessRunner Inner=new();
        internal int HashCalls,IndexCalls;internal Action? AfterHash;internal bool InvalidHashResponse;
        internal void Reset(){HashCalls=0;IndexCalls=0;}
        public async Task<VaultProcessResult> RunAsync(string executable,IReadOnlyList<string> arguments,string workingDirectory,CancellationToken cancellationToken=default)
        {
            bool hash=arguments[0]=="hash-object";
            if(hash){HashCalls++;Require(arguments.Count-4<=64,"Hash path count exceeded bound.");Require(arguments.Sum(value=>value.Length*2+3)<25000,"Hash command length exceeded bound.");}
            if(arguments[0]=="update-index"){IndexCalls++;Require(arguments.Count(value=>value=="--cacheinfo")<=64,"Index entry count exceeded bound.");}
            var result=await Inner.RunAsync(executable,arguments,workingDirectory,cancellationToken);
            if(hash){AfterHash?.Invoke();if(InvalidHashResponse)return result with{Output=Encoding.UTF8.GetBytes("invalid\n")};}
            return result;
        }
    }
}
