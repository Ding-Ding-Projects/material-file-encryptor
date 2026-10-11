using System.Runtime.ExceptionServices;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

namespace MaterialFileEncryptor.Core;

internal static class AtomicMetadataReplacement
{
    private const int MaximumAttempts=11;
    internal static void Replace(string temporary,string destination)
    {
        ExceptionDispatchInfo? first=null;
        for(int attempt=0;;attempt++)
        {
            try{File.Move(temporary,destination,true);return;}
            catch(Exception error) when(error is IOException or UnauthorizedAccessException)
            {
                first??=ExceptionDispatchInfo.Capture(error);
                if(!IsSharingConflict(error,temporary,destination))throw;
                if(attempt>=MaximumAttempts-1){first.Throw();throw;}
                Thread.Sleep(15);
            }
        }
    }
    internal static bool IsSharingConflict(Exception error,string temporary,string destination)
    {
        if(!OperatingSystem.IsWindows())return false;
        int code=error.HResult&0xffff;
        if(code is 32 or 33)return true;
        // MoveFileEx can report access denied for a destination reader that did
        // not grant delete sharing. Confirm that case rather than retrying ACLs.
        return code==5&&(DeleteAccessIsSharedOut(temporary)||DeleteAccessIsSharedOut(destination));
    }
    private static bool DeleteAccessIsSharedOut(string path)
    {
        using SafeFileHandle handle=CreateFile(path,0x00010000,7,IntPtr.Zero,3,0,IntPtr.Zero);
        return handle.IsInvalid&&Marshal.GetLastPInvokeError() is 32 or 33;
    }
    [DllImport("kernel32.dll",EntryPoint="CreateFileW",CharSet=CharSet.Unicode,SetLastError=true)]
    private static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
}
