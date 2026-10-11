using System.Security.Cryptography;
namespace MaterialFileEncryptor.Core;

public sealed partial class VaultEngine
{
    /// <summary>Builds ciphertext without exposing a partial namespace entry.</summary>
    public sealed class StagedImport : IDisposable
    {
        private readonly VaultEngine engine;
        private readonly string path;
        private readonly Entry entry;
        private readonly string journal;
        private readonly PartWriter writer;
        private readonly byte[] pendingBlock;
        private readonly IDisposable bufferReservation;
        private int pendingLength;
        private long nextBlock;
        private bool finished;
        internal static void DisposeWriterAndBuffer(Action disposeWriter,byte[] buffer,IDisposable reservation)
        {
            try{disposeWriter();}
            finally{CryptographicOperations.ZeroMemory(buffer);reservation.Dispose();}
        }
        internal StagedImport(VaultEngine engine,string path)
        {
            this.engine=engine;this.path=path;
            entry=new Entry { ChunkSize=engine.ChunkBytes(engine.partSize),PartSize=engine.partSize,Attributes=32 };
            journal=Path.Combine(engine.cache,"import-"+entry.Id+".mfe");
            writer=new PartWriter(engine,entry.PartSize);bufferReservation=TransferBufferBudget.Reserve(entry.ChunkSize+65536L);
            try{pendingBlock=new byte[entry.ChunkSize];}catch{bufferReservation.Dispose();throw;}
        }
        public void Write(long offset,ReadOnlySpan<byte> data,CancellationToken cancellationToken=default)
        {
            lock(engine.gate)
            {
                engine.Check();ObjectDisposedException.ThrowIf(finished,this);cancellationToken.ThrowIfCancellationRequested();
                if(offset!=entry.Length)throw new ArgumentException("Staged imports require sequential append offsets.",nameof(offset));
                if(offset>long.MaxValue-data.Length)throw new ArgumentOutOfRangeException(nameof(offset));
                var consumed=0;
                while(consumed<data.Length)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var take=Math.Min(data.Length-consumed,pendingBlock.Length-pendingLength);
                    data.Slice(consumed,take).CopyTo(pendingBlock.AsSpan(pendingLength));
                    pendingLength+=take;consumed+=take;entry.Length+=take;
                    if(pendingLength==pendingBlock.Length)
                    {
                        entry.Records[nextBlock++]=writer.Add(pendingBlock);
                        CryptographicOperations.ZeroMemory(pendingBlock);pendingLength=0;
                    }
                }
                writer.FlushDurable();
                // A bounded encrypted checkpoint preserves the unfinished tail without
                // serializing the growing record map or exposing a partial live entry.
                var tail=pendingBlock.AsSpan(0,pendingLength).ToArray();
                try { engine.WriteMetadata(journal,new { EntryId=entry.Id, Length=entry.Length, Offset=offset, Count=data.Length, PendingBlock=tail },"import",entry.Id); }
                finally { CryptographicOperations.ZeroMemory(tail); }
            }
        }
        public void Commit(CancellationToken cancellationToken=default)
        {
            lock(engine.gate)
            {
                engine.Check();ObjectDisposedException.ThrowIf(finished,this);cancellationToken.ThrowIfCancellationRequested();
                engine.EnsureParent(path);
                if(engine.entries.ContainsKey(path))throw new IOException("Import destination already exists.");
                if(pendingLength>0) { entry.Records[nextBlock++]=writer.Add(pendingBlock.AsSpan(0,pendingLength));CryptographicOperations.ZeroMemory(pendingBlock);pendingLength=0; }
                writer.Finish();
                var savedBaseline=engine.baseline;
                var savedPending=new HashSet<string>(engine.pending);
                var savedKnown=new HashSet<string>(engine.known);
                var savedHeads=new HashSet<string>(engine.heads);
                var savedVersions=new List<StoredVersion>(engine.pendingVersions);
                var savedHidden=new HashSet<string>(engine.pendingBinHidden);
                var savedDue=new Dictionary<string,DateTimeOffset>(engine.versionDue);
                engine.entries.Add(path,entry);engine.MarkDue(entry);
                try { engine.FlushLocal(); }
                catch
                {
                    // A failed checkpoint must not leave a prepared commit eligible
                    // for a later synchronization that silently installs this file.
                    engine.entries.Remove(path);engine.baseline=savedBaseline;
                    engine.pending=savedPending;engine.known=savedKnown;engine.heads=savedHeads;
                    engine.pendingVersions=savedVersions;engine.pendingBinHidden=savedHidden;engine.versionDue=savedDue;
                    throw;
                }
                finished=true;DisposeWriterAndBuffer(writer.Dispose,pendingBlock,bufferReservation);
                try { File.Delete(journal); } catch(IOException) { } catch(UnauthorizedAccessException) { }

            }
        }
        public void Dispose()
        {
            lock(engine.gate)
            {
                if(finished)return;finished=true;engine.versionDue.Remove(entry.Id);
                try { writer.Finish(); }
                finally { try{DisposeWriterAndBuffer(writer.Dispose,pendingBlock,bufferReservation);}finally{if(File.Exists(journal))File.Delete(journal);} }
                // Completed ciphertext parts remain unreferenced cache garbage.
            }
        }
    }
    public StagedImport BeginImport(string path)
    {
        lock(gate)
        {
            Check();path=VaultPath.Normalize(path);if(path==""||entries.ContainsKey(path))throw new IOException("Import destination already exists.");
            EnsureParent(path);return new StagedImport(this,path);
        }
    }
}
