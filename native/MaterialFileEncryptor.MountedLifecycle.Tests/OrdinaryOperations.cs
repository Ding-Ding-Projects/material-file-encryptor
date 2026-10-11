using System.IO.MemoryMappedFiles;
using System.Runtime.InteropServices;

internal static class OrdinaryOperations
{
    private static void Require(bool condition,string message){if(!condition)throw new InvalidOperationException(message);}
    internal static void Run(string fixture,string mounted,List<object> checks)
    {
        string document=Path.Combine(mounted,"editor.txt"),temporary=document+".tmp";
        File.WriteAllText(document,"original editor content");
        using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete))
        { stream.Write("replacement editor content"u8);stream.Flush(true); }
        File.Move(temporary,document,true);
        Require(File.ReadAllText(document)=="replacement editor content"&&!File.Exists(temporary),"Editor temporary-save replacement failed.");
        string renamed=Path.Combine(mounted,"renamed-editor.txt");
        using(var stream=new FileStream(document,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite|FileShare.Delete))
        { File.Move(document,renamed);stream.Position=stream.Length;stream.Write(" plus open-handle edit"u8);stream.Flush(true); }
        Require(File.ReadAllText(renamed)=="replacement editor content plus open-handle edit","Open handle lost identity after rename.");
        checks.Add(new{name="editor-temporary-save-and-open-handle-rename",verified=true});

        string mapped=Path.Combine(mounted,"mapped-persistence.bin");
        using(var seed=new FileStream(mapped,FileMode.CreateNew,FileAccess.Write)){seed.SetLength(131072);}
        byte[] payload=Enumerable.Range(0,4096).Select(index=>(byte)(index%251)).ToArray();
        using(var map=MemoryMappedFile.CreateFromFile(mapped,FileMode.Open))
        using(var view=map.CreateViewAccessor()){view.WriteArray(65536,payload,0,payload.Length);view.Flush();}
        using(var read=File.OpenRead(mapped)){read.Position=65536;byte[] actual=new byte[payload.Length];read.ReadExactly(actual);Require(actual.SequenceEqual(payload),"Mapped bytes did not persist after view closure.");}
        checks.Add(new{name="mapped-write-flush-and-reopen",verified=true,verifiedBytes=payload.Length});

        string closed=Path.Combine(mounted,"ordinary-close.bin");
        using(var stream=new FileStream(closed,FileMode.CreateNew,FileAccess.Write)){stream.Write(payload);}
        Require(File.ReadAllBytes(closed).SequenceEqual(payload),"Ordinary close discarded written bytes.");
        checks.Add(new{name="ordinary-close-retains-partial-file",verified=true,retainedBytes=payload.Length,semantics="Close supplies no cancellation intent; written bytes remain."});
        File.Delete(closed);Require(!File.Exists(closed),"Explicit deletion did not remove partial file.");
        string deleteOnClose=Path.Combine(mounted,"delete-on-close.bin");
        using(var stream=new FileStream(deleteOnClose,FileMode.CreateNew,FileAccess.Write,FileShare.ReadWrite|FileShare.Delete,4096,FileOptions.DeleteOnClose)){stream.Write(payload);}
        Require(!File.Exists(deleteOnClose),"Delete-on-close did not remove partial file.");
        checks.Add(new{name="explicit-delete-and-delete-on-close",verified=true});

        string source=Path.Combine(fixture,"native-copy-source.bin");
        using(var stream=File.Create(source)){for(int index=0;index<4096;index++)stream.Write(payload);}
        bool referenceExists=false;long referenceLength=0;
        foreach(var scenario in new[]{(cancel:true,reference:false),(cancel:false,reference:true),(cancel:false,reference:false)})
        {
            bool cancel=scenario.cancel;
            string destination=Path.Combine(scenario.reference?fixture:mounted,cancel?"cancel-copy.bin":"stop-copy.bin");
            long transferred=0;int callbacks=0;bool cancellationFlag=false;
            Progress callback=(total,bytes,streamSize,streamBytes,number,reason,sourceHandle,destinationHandle,data)=>
            {callbacks++;transferred=bytes;return bytes>0?(cancel?1u:2u):0u;};
            bool succeeded=CopyFileEx(source,destination,callback,IntPtr.Zero,ref cancellationFlag,0);
            int error=Marshal.GetLastWin32Error();GC.KeepAlive(callback);
            Require(!succeeded&&error==1235&&transferred>0,"CopyFileEx did not observe requested interruption.");
            bool exists=File.Exists(destination);long length=exists?new FileInfo(destination).Length:0;
            if(scenario.reference){referenceExists=exists;referenceLength=length;}
            bool matches=cancel?!exists:scenario.reference||(exists==referenceExists&&length==referenceLength);
            checks.Add(new{name=cancel?"native-copy-progress-cancel":scenario.reference?"reference-copy-progress-stop":"native-copy-progress-stop",verified=matches,win32Error=error,callbacks,transferredBytes=transferred,destinationExists=exists,destinationBytes=length,comparison=cancel?"cancel removes incomplete destination":"measured normal-volume behavior"});
            Require(matches,$"Mounted CopyFileEx result differed from normal-volume reference: cancel={cancel}, exists={exists}, length={length}, transferred={transferred}.");
            if(exists)File.Delete(destination);
        }
    }
    private delegate uint Progress(long total,long transferred,long streamSize,long streamTransferred,uint streamNumber,uint reason,IntPtr source,IntPtr destination,IntPtr data);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    [return:MarshalAs(UnmanagedType.Bool)]
    private static extern bool CopyFileEx(string source,string destination,Progress progress,IntPtr data,[MarshalAs(UnmanagedType.Bool)] ref bool cancel,uint flags);
}
