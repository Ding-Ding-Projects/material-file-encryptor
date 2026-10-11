using System.Security.Cryptography;

internal static class HelperAdmission
{
    internal static string Verify(string executable,string expected)
    {
        if(expected.Length!=64||!expected.All(Uri.IsHexDigit))throw new ArgumentException("Expected helper SHA-256 must contain 64 hexadecimal characters.");
        string actual=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(executable)));
        if(!actual.Equals(expected,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Packaged native helper SHA-256 does not match the production receipt.");
        return actual;
    }
    internal static void SelfTest()
    {
        string fixture=Path.Combine(Path.GetTempPath(),"mfe-helper-admission-"+Guid.NewGuid().ToString("N"));
        try
        {
            File.WriteAllBytes(fixture,new byte[]{1,2,3});
            string expected=Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(fixture)));
            Verify(fixture,expected.ToLowerInvariant());
            File.WriteAllBytes(fixture,new byte[]{1,2,4});
            bool rejected=false;try{Verify(fixture,expected);}catch(InvalidOperationException){rejected=true;}
            if(!rejected)throw new Exception("Changed helper bytes passed admission.");
            rejected=false;try{Verify(fixture,"bad");}catch(ArgumentException){rejected=true;}
            if(!rejected)throw new Exception("Malformed helper hash passed admission.");
            Console.WriteLine("PASS helper admission accepts exact bytes and rejects changed bytes and malformed expected hash before launch");
        }
        finally{File.Delete(fixture);}
    }
}
