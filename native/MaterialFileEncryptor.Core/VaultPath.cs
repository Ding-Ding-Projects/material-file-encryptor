namespace MaterialFileEncryptor.Core;
public static class VaultPath
{
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase) { "CON", "PRN", "AUX", "NUL", "CLOCK$", "CONIN$", "CONOUT$" };
    public static string Normalize(string path)
    {
        ArgumentNullException.ThrowIfNull(path);
        path = path.Replace('\\', '/');
        if (path.Length > 32767 || path.Contains(':') || path.StartsWith("//", StringComparison.Ordinal)) throw new ArgumentException("Invalid vault path.");
        var components = path.Trim('/').Split('/', StringSplitOptions.None);
        if (components.Length == 1 && components[0] == "") return "";
        foreach (var part in components)
        {
            if (part.Length is 0 or > 255 || part is "." or ".." || part.EndsWith('.') || part.EndsWith(' ') || part.Any(c => c < 32 || "<>:\"|?*".Contains(c))) throw new ArgumentException("Invalid Windows path component.");
            var stem = part.Split('.')[0];
            if (Reserved.Contains(stem) || stem.Length == 4 && (stem.StartsWith("COM", StringComparison.OrdinalIgnoreCase) || stem.StartsWith("LPT", StringComparison.OrdinalIgnoreCase)) && (stem[3] is >= '1' and <= '9' or '¹' or '²' or '³')) throw new ArgumentException("Reserved Windows filename.");
        }
        return string.Join('/', components);
    }
    internal static string Parent(string path) => path.Contains('/') ? path[..path.LastIndexOf('/')] : "";
}
