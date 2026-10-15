namespace MaterialFileEncryptor.Host;

// Raised when an ordinary lock cannot dismount because something still uses the
// drive. The message names the kind of holder, never a program path or a file
// name, and always points at Force lock, which releases the holders safely.
internal sealed class DriveBusyException(string message, string[] holders) : InvalidOperationException(message)
{
    public string[] Holders { get; } = holders;

    internal static DriveBusyException From(VaultFileSystem.HolderSummary holders)
    {
        var kinds = new List<string>();
        if (holders.ActiveIo != 0) kinds.Add("input-output");
        if (holders.Explorer != 0) kinds.Add("explorer");
        if (holders.Search != 0) kinds.Add("search");
        if (holders.Security != 0) kinds.Add("security");
        if (holders.Application != 0) kinds.Add("application");
        if (holders.Other != 0 || (holders.Handles != 0 && kinds.Count == 0)) kinds.Add("other");
        return new DriveBusyException(Describe(kinds), kinds.ToArray());
    }

    internal static string Describe(IReadOnlyList<string> kinds)
    {
        if (kinds.Contains("input-output"))
            return "The drive is still reading or writing data, so it was not locked. Wait a moment and try again, or choose Force lock to cancel the work and lock now.";
        if (kinds.Contains("explorer"))
            return "Windows Explorer still has the drive open, for example a window or preview pane showing it, so it was not locked. Close those windows and try again, or choose Force lock to release them and lock now.";
        if (kinds.Contains("search") || kinds.Contains("security"))
            return "Windows Search or a security scan is still reading the drive, so it was not locked. This usually ends in a moment. Try again, or choose Force lock to release it and lock now.";
        return "A program still has files or folders on the drive open, so it was not locked. Close the program and try again, or choose Force lock to release them and lock now.";
    }
}
