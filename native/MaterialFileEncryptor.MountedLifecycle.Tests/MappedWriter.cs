using System.IO.MemoryMappedFiles;

internal static class MappedWriter
{
    private static byte[] Payload() => Enumerable.Range(0,65536).Select(i=>(byte)(i%251)).ToArray();
    internal static void Run(string path,string ready,string stop)
    {
        byte[] bytes=Payload();
        using var file=new FileStream(path,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite|FileShare.Delete);
        using var map=MemoryMappedFile.CreateFromFile(file,null,0,MemoryMappedFileAccess.ReadWrite,HandleInheritability.None,true);
        using var view=map.CreateViewAccessor();
        view.WriteArray(0,bytes,0,bytes.Length);view.Flush();File.WriteAllText(ready,"ready");
        var deadline=System.Diagnostics.Stopwatch.StartNew();
        while(!File.Exists(stop)&&deadline.Elapsed<TimeSpan.FromSeconds(45))
        {view.WriteArray(0,bytes,0,bytes.Length);view.Flush();Thread.Sleep(1);}
        if(!File.Exists(stop))throw new TimeoutException("Parent did not stop mapped writer.");
        view.Flush();file.Flush(true);
    }
    internal static void Verify(string path)
    {
        using var file=File.OpenRead(path);byte[] bytes=new byte[65536];file.ReadExactly(bytes);
        if(!bytes.SequenceEqual(Payload()))throw new IOException("Authenticated reopen changed mapped bytes.");
    }
}
