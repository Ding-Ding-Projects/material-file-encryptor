# Fixed-purpose hidden console relay for the official Docker CLI device flow.
# No credential, device code or child output is written to files or diagnostics.
param([Parameter(Mandatory=$true)][string]$DockerExecutable,[Parameter(Mandatory=$true)][string]$ConfigurationDirectory)
$ErrorActionPreference='Stop'
try {
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32.SafeHandles;
public static class RegistryLoginConsole {
 [StructLayout(LayoutKind.Sequential)] struct COORD { public short X,Y; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct STARTUPINFO { public int cb;public string reserved,desktop,title;public int x,y,xSize,ySize,xChars,yChars,fill,flags;public short show,reservedBytes;public IntPtr reservedPointer,stdInput,stdOutput,stdError; }
 [StructLayout(LayoutKind.Sequential)] struct STARTUPINFOEX { public STARTUPINFO StartupInfo;public IntPtr Attributes; }
 [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr Process,Thread;public int ProcessId,ThreadId; }
 [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMIT { public long perProcess,perJob;public uint flags;public UIntPtr min,max;public uint active;public UIntPtr affinity;public uint priority,scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
 [StructLayout(LayoutKind.Sequential)] struct EXTENDED_LIMIT { public BASIC_LIMIT basic;public IO_COUNTERS io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,IntPtr attributes,int size);
 [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(COORD size,IntPtr input,IntPtr output,uint flags,out IntPtr console);
 [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr console);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
 [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string executable,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr environment,string directory,ref STARTUPINFOEX startup,out PROCESS_INFORMATION information);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int info,ref EXTENDED_LIMIT data,uint size);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
 [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
 [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
 [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 static void Check(bool result){if(!result)throw new IOException("Console relay could not initialize.");}
 public static int Run(string executable,string config) {
  if(!Path.IsPathRooted(executable)||!Path.IsPathRooted(config)||executable.IndexOf('"')>=0||config.IndexOf('"')>=0)throw new ArgumentException();
  IntPtr inputRead=IntPtr.Zero,inputWrite=IntPtr.Zero,outputRead=IntPtr.Zero,outputWrite=IntPtr.Zero,console=IntPtr.Zero,list=IntPtr.Zero,job=IntPtr.Zero;
  PROCESS_INFORMATION process=new PROCESS_INFORMATION();bool resumed=false;Thread pump=null;
  try {
   Check(CreatePipe(out inputRead,out inputWrite,IntPtr.Zero,0));Check(CreatePipe(out outputRead,out outputWrite,IntPtr.Zero,0));
   if(CreatePseudoConsole(new COORD{X=200,Y=40},inputRead,outputWrite,0,out console)!=0)throw new IOException();
   CloseHandle(inputRead);inputRead=IntPtr.Zero;CloseHandle(outputWrite);outputWrite=IntPtr.Zero;
   IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,1,0,ref size));
   Check(UpdateProcThreadAttribute(list,0,(IntPtr)0x00020016,console,(IntPtr)IntPtr.Size,IntPtr.Zero,IntPtr.Zero));
   STARTUPINFOEX startup=new STARTUPINFOEX();startup.StartupInfo.cb=Marshal.SizeOf(typeof(STARTUPINFOEX));startup.Attributes=list;
   job=CreateJobObject(IntPtr.Zero,null);Check(job!=IntPtr.Zero);EXTENDED_LIMIT limits=new EXTENDED_LIMIT();limits.basic.flags=0x00002000;Check(SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(EXTENDED_LIMIT))));
   Check(CreateProcess(executable,new StringBuilder("\""+executable+"\" --config \""+config+"\" login"),IntPtr.Zero,IntPtr.Zero,false,0x00080000|0x00000004,IntPtr.Zero,Path.GetDirectoryName(executable),ref startup,out process));
   Check(AssignProcessToJobObject(job,process.Process));
   IntPtr ownedRead=outputRead;outputRead=IntPtr.Zero;
   pump=new Thread(delegate(){try{using(var stream=new FileStream(new SafeFileHandle(ownedRead,true),FileAccess.Read)){var target=Console.OpenStandardOutput();byte[] buffer=new byte[4096];int read;while((read=stream.Read(buffer,0,buffer.Length))!=0){target.Write(buffer,0,read);target.Flush();}}}catch(IOException){} });pump.IsBackground=true;pump.Start();
   if(ResumeThread(process.Thread)==0xffffffff)throw new IOException();resumed=true;
   if(WaitForSingleObject(process.Process,650000)!=0)throw new IOException();uint code;Check(GetExitCodeProcess(process.Process,out code));
   ClosePseudoConsole(console);console=IntPtr.Zero;pump.Join(3000);return unchecked((int)code);
  } finally {
   if(process.Process!=IntPtr.Zero&&!resumed)TerminateProcess(process.Process,125);
   if(job!=IntPtr.Zero)CloseHandle(job);
   if(console!=IntPtr.Zero)ClosePseudoConsole(console);
   if(list!=IntPtr.Zero){DeleteProcThreadAttributeList(list);Marshal.FreeHGlobal(list);}
   foreach(IntPtr handle in new[]{inputRead,inputWrite,outputRead,outputWrite,process.Thread,process.Process})if(handle!=IntPtr.Zero)CloseHandle(handle);
  }
 }
}
"@
exit [RegistryLoginConsole]::Run($DockerExecutable,$ConfigurationDirectory)
} catch { [Console]::Error.WriteLine('Registry login relay is unavailable.'); exit 125 }
