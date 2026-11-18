namespace MaterialFileEncryptor.Core;

/// <summary>
/// Replaces a file by rename, retrying briefly when another program holds the destination open.
/// Antivirus scanners, search indexers and cloud sync clients commonly open a file for a moment right
/// after it is written; on Windows the rename then fails with a sharing violation even though nothing
/// is wrong. A fresh storage folder hits this most, because every object in it is new.
/// Replacing a destination that another program has open fails with "access denied" rather than a
/// sharing violation, so that error is retried too. Only these errors are retried, a bounded number of
/// times (about 1.6 seconds in all); every other error is reported unchanged, and when the hold lasts
/// longer the last attempt's error is the one the caller sees.
/// </summary>
public static class TransientFileMove
{
    private const int SharingViolation = unchecked((int)0x80070020);
    private const int LockViolation = unchecked((int)0x80070021);
    private static readonly int[] DelaysMs = [25, 50, 100, 200, 400, 800];

    public static bool IsTransient(Exception error) => error is UnauthorizedAccessException || error is IOException io && (io.HResult == SharingViolation || io.HResult == LockViolation);

    public static void Move(string source, string destination, bool overwrite, CancellationToken token = default, Action<int>? sleep = null)
    {
        sleep ??= Thread.Sleep;
        for (var attempt = 0; ; attempt++)
        {
            try { File.Move(source, destination, overwrite); return; }
            catch (Exception error) when (IsTransient(error) && attempt < DelaysMs.Length)
            {
                token.ThrowIfCancellationRequested();
                sleep(DelaysMs[attempt]);
            }
        }
    }
}
