using System.Security.Cryptography;
using MaterialFileEncryptor.Core;

internal static class ImportJournalRegression
{
    internal static void CrashChild(string root)
    {
        var credentials=VaultCredentials.Password("synthetic crash import");
        var engine=VaultEngine.Create(new(){StorageRoot=Path.Combine(root,"storage"),CacheRoot=Path.Combine(root,"cache"),PartSizeBytes=1048576},credentials);
        var staged=engine.BeginImport("crashed.bin");staged.Write(0,new byte[65536]);Environment.Exit(0);
    }
    internal static void Run()
    {
        string root=Path.Combine(Path.GetTempPath(),"mfe-import-journal-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        byte[] key=RandomNumberGenerator.GetBytes(32);string path=Path.Combine(root,"progress.mfe");const string domain="synthetic-import";
        try
        {
            using(var journal=new EncryptedImportJournal(path,key,domain))
            {
                journal.Append(65535,0,65535,new byte[65535]);
                using var held=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite);
                for(int i=0;i<100;i++)journal.Append(65536L+i,65535+i,1,[]);
            }
            byte[] valid=File.ReadAllBytes(path);long count=EncryptedImportJournal.Validate(path,key,domain);
            if(count!=102)throw new Exception("Import journal frame count mismatch.");
            File.WriteAllBytes(path,valid[..^1]);if(EncryptedImportJournal.Validate(path,key,domain)!=count-1)throw new Exception("Incomplete terminal frame was not ignored.");
            foreach(int index in new[]{0,48,100,valid.Length-1})
            {
                var corrupt=valid.ToArray();corrupt[index]^=1;File.WriteAllBytes(path,corrupt);
                try{EncryptedImportJournal.Validate(path,key,domain);throw new Exception("Corrupt import journal accepted.");}catch(CryptographicException){ }
            }
            File.WriteAllBytes(path,valid);
            try{EncryptedImportJournal.Validate(path,key,"wrong-domain");throw new Exception("Wrong journal identity accepted.");}catch(CryptographicException){ }
            var options=new VaultOptions{StorageRoot=Path.Combine(root,"storage"),CacheRoot=Path.Combine(root,"cache"),PartSizeBytes=1048576};
            using var credentials=VaultCredentials.Password("synthetic import append test");
            using(var engine=VaultEngine.Create(options,credentials))
            {
                using(var staged=engine.BeginImport("unfinished.bin"))staged.Write(0,new byte[65536]);
                if(engine.GetInfo("unfinished.bin")!=null)throw new Exception("Unfinished import became visible.");
                using(var staged=engine.BeginImport("complete.bin")){staged.Write(0,new byte[65536]);staged.Commit();}
            }
            using(var reopened=VaultEngine.Open(options,credentials))
                if(reopened.GetInfo("unfinished.bin")!=null||reopened.GetInfo("complete.bin")?.Length!=65536)throw new Exception("Import restart visibility failed.");
            string crashRoot=Path.Combine(root,"crash");Directory.CreateDirectory(crashRoot);
            var childStart=new System.Diagnostics.ProcessStartInfo(Environment.ProcessPath!){UseShellExecute=false,CreateNoWindow=true};
            if(Path.GetFileNameWithoutExtension(Environment.ProcessPath).Equals("dotnet",StringComparison.OrdinalIgnoreCase))childStart.ArgumentList.Add(typeof(ImportJournalRegression).Assembly.Location);
            childStart.ArgumentList.Add("--import-crash-child");childStart.ArgumentList.Add(crashRoot);
            using(var child=System.Diagnostics.Process.Start(childStart)!)
                if(!child.WaitForExit(10000)||child.ExitCode!=0)throw new Exception("Import crash child failed.");
            using var crashCredentials=VaultCredentials.Password("synthetic crash import");
            using(var reopened=VaultEngine.Open(new(){StorageRoot=Path.Combine(crashRoot,"storage"),CacheRoot=Path.Combine(crashRoot,"cache")},crashCredentials))
                if(reopened.GetInfo("crashed.bin")!=null)throw new Exception("Crashed import was published.");
            Console.WriteLine("PASS authenticated append progress, bounded frames, held readers, tamper/truncation and unpublished restart");
        }
        finally{CryptographicOperations.ZeroMemory(key);Directory.Delete(root,true);}
    }
}
