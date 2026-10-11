using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;

// Squirrel's forward ZIP reader cannot traverse a stored nested ZIP entry.
// Preserve its supported archive tool while explicitly selecting Deflate.
internal static class SquirrelArchiveWriter
{
    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1); result.Append(c); }
            else { result.Append('\\', slashes); result.Append(c); }
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        return result.Append('"').ToString();
    }

    private static int Main(string[] args)
    {
        try
        {
            var writer = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "7za-real.exe");
            var arguments = args.Select(Quote).ToList();
            if (args.Length > 0 && args[0].Equals("a", StringComparison.OrdinalIgnoreCase) &&
                args.Any(arg => arg.Equals("-tzip", StringComparison.OrdinalIgnoreCase)))
                arguments.Add("-mm=Deflate");
            using (var process = Process.Start(new ProcessStartInfo(writer, string.Join(" ", arguments)) {
                UseShellExecute = false, CreateNoWindow = true
            }))
            {
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch { Console.Error.WriteLine("SQUIRREL_ARCHIVE_WRITER_FAILED"); return 1; }
    }
}
