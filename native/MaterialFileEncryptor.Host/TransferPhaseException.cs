namespace MaterialFileEncryptor.Host;

internal enum TransferPhase { Metadata, SourceOpen, SourceRead, StagingBegin, StagingWrite, Install, Activity }
internal sealed class TransferPhaseException(TransferPhase phase, Exception inner) : Exception("Transfer stage failed.", inner)
{
    internal TransferPhase Phase { get; } = phase;
    internal static string? GetSafePhase(Exception error)
    {
        for(Exception? current=error;current is not null;current=current.InnerException)
            if(current is TransferPhaseException staged)
                return staged.Phase switch
                {
                    TransferPhase.Metadata=>"metadata",TransferPhase.SourceOpen=>"source-open",TransferPhase.SourceRead=>"source-read",
                    TransferPhase.StagingBegin=>"staging-begin",TransferPhase.StagingWrite=>"staging-write",TransferPhase.Install=>"install",
                    TransferPhase.Activity=>"activity",_=>null
                };
        return null;
    }
}
