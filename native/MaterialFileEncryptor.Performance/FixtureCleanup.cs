using System.Security.Cryptography;
using System.Text;

internal static class FixtureCleanup
{
    internal static void DeleteOwned(string path)
    {
        if(!Directory.Exists(path))return;
        var directories=new Stack<string>();directories.Push(Path.GetFullPath(path));var ordered=new List<string>();
        while(directories.Count>0)
        {
            string directory=directories.Pop();
            if((File.GetAttributes(directory)&FileAttributes.ReparsePoint)!=0)throw new IOException("Synthetic fixture unexpectedly contains a directory link.");
            ordered.Add(directory);
            foreach(string item in Directory.EnumerateFileSystemEntries(directory))
            {
                var attributes=File.GetAttributes(item);
                if((attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("Synthetic fixture unexpectedly contains a link.");
                if((attributes&FileAttributes.Directory)!=0)directories.Push(item);
                else{File.SetAttributes(item,FileAttributes.Normal);File.Delete(item);}
            }
        }
        foreach(string directory in ordered.AsEnumerable().Reverse()){File.SetAttributes(directory,FileAttributes.Normal);Directory.Delete(directory);}
    }
    internal static void Check()
    {
        string root=Path.Combine(Path.GetTempPath(),"mfe-cleanup-"+Guid.NewGuid().ToString("N"));string folder=Path.Combine(root,".git","objects","aa");Directory.CreateDirectory(folder);
        string file=Path.Combine(folder,"test");File.WriteAllText(file,"synthetic read-only object");File.SetAttributes(file,FileAttributes.ReadOnly);
        DeleteOwned(root);if(Directory.Exists(root))throw new IOException("Synthetic cleanup retained owned content.");Console.WriteLine("PASS owned read-only history fixture cleanup");
    }
}
