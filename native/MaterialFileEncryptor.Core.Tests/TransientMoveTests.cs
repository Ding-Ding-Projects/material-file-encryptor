using MaterialFileEncryptor.Core;

internal static class TransientMoveTests
{
    public static void Run()
    {
        var root = Path.Combine(Path.GetTempPath(), "mfe-transient-move-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(root);
        try
        {
            var source = Path.Combine(root, "object.tmp"); var destination = Path.Combine(root, "object.mfe");
            File.WriteAllText(destination, "old"); File.WriteAllText(source, "new");
            // Another program (a scanner, an indexer) holds the destination for a moment, then lets go.
            var holder = new FileStream(destination, FileMode.Open, FileAccess.Read, FileShare.None);
            var waits = 0;
            TransientFileMove.Move(source, destination, true, default, ms => { waits++; if (waits == 2) holder.Dispose(); Thread.Sleep(ms); });
            Require(waits >= 2, "The move waited while the destination was held");
            Require(File.ReadAllText(destination) == "new" && !File.Exists(source), "The move completed once the destination was released");

            // A destination that stays held fails after a bounded number of short waits, with the real error.
            File.WriteAllText(source, "again");
            using (new FileStream(destination, FileMode.Open, FileAccess.Read, FileShare.None))
            {
                var attempts = 0; Exception? failure = null;
                try { TransientFileMove.Move(source, destination, true, default, _ => attempts++); } catch (Exception error) when (error is IOException or UnauthorizedAccessException) { failure = error; }
                Require(failure is not null && TransientFileMove.IsTransient(failure), "A lasting hold reports the real access error");
                Require(attempts == 6, "Waits are bounded");
            }
            Require(File.Exists(source), "Nothing is lost when the move gives up");

            // Errors that are not about another program holding the file are never retried.
            var missing = 0;
            try { TransientFileMove.Move(Path.Combine(root, "missing.tmp"), destination, true, default, _ => missing++); Require(false, "A missing source must fail"); }
            catch (FileNotFoundException) { }
            Require(missing == 0, "Other errors are reported at once");
        }
        finally { try { Directory.Delete(root, true); } catch { } }
    }
    private static void Require(bool value, string message) { if (!value) throw new Exception(message); }
}
