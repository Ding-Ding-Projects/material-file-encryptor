using System.Text.Json;

internal sealed class ArchiveCommand
{
    internal string[] Arguments { get; }
    private readonly string work;
    private readonly string operation;
    private ArchiveCommand(string[] arguments, string directory, string action) { Arguments = arguments; work = directory; operation = action; }
    internal static ArchiveCommand Create(JsonElement options, string runtime, string work)
    {
        if (options.ValueKind != JsonValueKind.Object || options.EnumerateObject().Any(p => p.Name is not ("operation" or "format" or "entry"))) throw new ArgumentException("Only a fixed archive operation and format may be supplied.");
        var operation = options.GetProperty("operation").GetString();
        var format = options.GetProperty("format").GetString();
        if (operation is not ("list" or "extract-stream") || format is not ("7z" or "rar")) throw new ArgumentException("Unsupported archive operation.");
        if (!Path.GetFileName(runtime).Equals("7z.exe", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Only staged 7-Zip is supported.");
        var input = Path.Combine(work, "input-0.bin");
        if (!File.Exists(input) || new FileInfo(input).Length is <= 0 or > 67108864) throw new ArgumentException("Archive input limit exceeded.");
        var arguments = new List<string> { operation == "list" ? "l" : "x", "-t" + format, "-bd", "-bse0", "-bsp0", "-sccUTF-8", "-p", "-mmt=1" };
        if (operation == "list") arguments.AddRange(["-slt", "-ba"]);
        else arguments.AddRange(["-so", "-y", "-bso0"]);
        arguments.Add(input);
        if (operation == "extract-stream")
        {
            var entry = options.GetProperty("entry").GetString();
            if (string.IsNullOrEmpty(entry) || entry.Length > 240 || entry.Any(c => char.IsControl(c) || ":<>\"|?*_".Contains(c)) || entry.StartsWith('/') || entry.StartsWith('\\') || entry.Replace('\\','/').Split('/').Any(p => p is "" or "." or "..")) throw new ArgumentException("Unsafe archive entry.");
            arguments.Add("-spd"); arguments.Add("--"); arguments.Add(entry);
        }
        return new(arguments.ToArray(), work, operation!);
    }
    internal bool LimitsExceeded() => new FileInfo(Path.Combine(work, "worker.log")).Length > (operation == "list" ? 1048576 : 67108864);
    internal void WriteResult(string nonce)
    {
        if (LimitsExceeded()) throw new InvalidDataException("Archive output limit exceeded.");
        var output = Path.Combine(work, "result-0.bin");
        File.Copy(Path.Combine(work, "worker.log"), output, false);
        var size = new FileInfo(output).Length;
        File.WriteAllBytes(Path.Combine(work, "result.json"), JsonSerializer.SerializeToUtf8Bytes(new { schema = 1, nonce, outputs = new[] { new { name = "archive-stream.bin", filename = "result-0.bin", bytes = size } }, details = new { operation } }));
    }
}
