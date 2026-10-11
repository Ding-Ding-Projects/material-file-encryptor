$ErrorActionPreference = 'Stop'
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('media-command-tests-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
try {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'MediaCommand.cs') -Destination $scratch
    [IO.File]::WriteAllText((Join-Path $scratch 'Test.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><ImplicitUsings>enable</ImplicitUsings><Nullable>enable</Nullable></PropertyGroup></Project>')
    $source = @'
using System.Text.Json;
var root = Path.Combine(Path.GetTempPath(), "media-command-fixture-" + Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(root);
int passed = 0;
void Check(bool value) { if(!value) throw new Exception("Assertion failed"); passed++; }
void Reject(Action action) { try { action(); } catch(ArgumentException) { passed++; return; } throw new Exception("Expected rejection"); }
JsonElement Options(string operation) => JsonSerializer.SerializeToElement(new {operation});
try {
 File.WriteAllBytes(Path.Combine(root,"input-0.bin"),[1]);
 foreach(var op in new[]{"probe","image-png","image-jpeg","audio-wav","audio-flac","audio-mp3","video-mp4","validate"}) {
  var runtime=op=="probe"?"ffprobe.exe":"ffmpeg.exe";
  var command=MediaCommand.Create(Options(op),runtime,root);
  Check(command.Arguments.Contains("-protocol_whitelist"));
  Check(command.Arguments.Contains("file,pipe"));
  Check(command.Arguments.Contains(Path.Combine(root,"input-0.bin")));
  Check(!command.Arguments.Any(a=>a.Contains("http:")));
 }
 Reject(()=>MediaCommand.Create(Options("shell"),"ffmpeg.exe",root));
 Reject(()=>MediaCommand.Create(Options("probe"),"ffmpeg.exe",root));
 Reject(()=>MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation="probe",args="-anything"}),"ffprobe.exe",root));
 Reject(()=>MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation="probe",profile="unknown"}),"ffprobe.exe",root));
 Reject(()=>MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation="probe",profile=7}),"ffprobe.exe",root));
 Reject(()=>MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation="probe",profile=(string?)null}),"ffprobe.exe",root));
 var defaultAudio=MediaCommand.Create(Options("audio-mp3"),"ffmpeg.exe",root);
 var explicitDefault=MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation="audio-mp3",profile="default"}),"ffmpeg.exe",root);
 Check(defaultAudio.Arguments.SequenceEqual(explicitDefault.Arguments));
 Check(defaultAudio.Arguments.Contains("libmp3lame"));
 var minimalAudio=MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation="audio-mp3",profile="minimal-v1"}),"ffmpeg.exe",root);
 Check(minimalAudio.Arguments.Contains("mp3_mf") && minimalAudio.Arguments.Contains("192k"));
 Check(!minimalAudio.Arguments.Contains("libmp3lame"));
 var minimalVideo=MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation="video-mp4",profile="minimal-v1"}),"ffmpeg.exe",root);
 Check(minimalVideo.Arguments.Contains("mpeg4") && minimalVideo.Arguments.Contains("-q:v") && minimalVideo.Arguments.Contains("3"));
 Check(minimalVideo.Arguments.Contains("aac") && minimalVideo.Arguments.Contains("128k"));
 Check(!minimalVideo.Arguments.Any(a=>new[]{"libx264","-preset","-crf"}.Contains(a)));
 Check(minimalVideo.Arguments[Array.IndexOf(minimalVideo.Arguments,"-c:v")+1]=="mpeg4" && minimalVideo.Arguments[Array.IndexOf(minimalVideo.Arguments,"-q:v")+1]=="3");
 var defaultVideo=MediaCommand.Create(Options("video-mp4"),"ffmpeg.exe",root);
 Check(defaultVideo.Arguments.Contains("libx264") && defaultVideo.Arguments.Contains("-preset") && defaultVideo.Arguments.Contains("-crf"));
 foreach(var op in new[]{"probe","image-png","image-jpeg","audio-wav","audio-flac","validate"}) {
  var runtime=op=="probe"?"ffprobe.exe":"ffmpeg.exe";
  Check(MediaCommand.Create(Options(op),runtime,root).Arguments.SequenceEqual(MediaCommand.Create(JsonSerializer.SerializeToElement(new{operation=op,profile="minimal-v1"}),runtime,root).Arguments));
 }
 File.WriteAllText(Path.Combine(root,"worker.log"),"{\"streams\":[{\"codec_type\":\"audio\"}],\"format\":{\"format_name\":\"wav\"}}");
 MediaCommand.Create(Options("probe"),"ffprobe.exe",root).WriteResult("nonce");
 using(var result=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"result.json")))) {
  Check(result.RootElement.GetProperty("nonce").GetString()=="nonce");
  Check(result.RootElement.GetProperty("outputs").GetArrayLength()==0);
 }
 File.Delete(Path.Combine(root,"result.json"));
 var convert=MediaCommand.Create(Options("image-png"),"ffmpeg.exe",root);
 File.WriteAllBytes(Path.Combine(root,"result-0.bin"),[1,2,3]);
 convert.WriteResult("nonce");
 using(var result=JsonDocument.Parse(File.ReadAllText(Path.Combine(root,"result.json")))) {
  var output=result.RootElement.GetProperty("outputs")[0];
  Check(output.GetProperty("filename").GetString()=="result-0.bin");
  Check(output.GetProperty("bytes").GetInt32()==3);
 }
 Console.WriteLine($"PASS: {passed} fixed media command and receipt assertions.");
} finally { Directory.Delete(root,true); }
'@
    [IO.File]::WriteAllText((Join-Path $scratch 'Program.cs'), $source)
    & dotnet run --project (Join-Path $scratch 'Test.csproj') --configuration Release --nologo
    if ($LASTEXITCODE -ne 0) { throw "Media command tests failed with exit $LASTEXITCODE" }
} finally {
    $resolved = [IO.Path]::GetFullPath($scratch)
    if (-not $resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()),[StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($resolved)).StartsWith('media-command-tests-')) { throw 'Unexpected cleanup path.' }
    Remove-Item -LiteralPath $scratch -Recurse -Force
}
