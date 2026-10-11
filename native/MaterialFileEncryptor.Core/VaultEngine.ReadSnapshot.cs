namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    private readonly Dictionary<string,Entry> readSnapshots = [];

    public ReadSnapshot AcquireReadSnapshot(string path)
    {
        lock(gate)
        {
            Check();var entry=Clone(Find(VaultPath.Normalize(path)));
            if(entry.Directory)throw new IOException("Choose a file to export.");
            var identity=Guid.NewGuid().ToString("N");readSnapshots.Add(identity,entry);
            return new ReadSnapshot(this,identity,entry.Id,entry.Length);
        }
    }

    public sealed class ReadSnapshot : IDisposable
    {
        private readonly VaultEngine engine;
        private readonly string identity;
        internal ReadSnapshot(VaultEngine engine,string identity,string entryId,long length)
        {this.engine=engine;this.identity=identity;EntryId=entryId;Length=length;}
        public string EntryId { get; }
        public long Length { get; }
        private Entry GetEntry()=>engine.readSnapshots.TryGetValue(identity,out var entry)?entry:throw new ObjectDisposedException(nameof(ReadSnapshot));
        public Task PrepareRangeAsync(long offset,int length,CancellationToken cancellationToken=default) => engine.PrepareAsync(()=>
        {
            var entry=GetEntry();return new[]{(identity,entry,RangeRecords(entry,offset,Math.Min(length,Math.Max(0,entry.Length-offset))))};
        },cancellationToken);
        public int ReadRange(long offset,Span<byte> destination,CancellationToken cancellationToken=default)
        {lock(engine.gate){engine.Check();return engine.Read(GetEntry(),offset,destination,cancellationToken);}}
        public void Dispose(){lock(engine.gate)engine.readSnapshots.Remove(identity);}
    }
}
