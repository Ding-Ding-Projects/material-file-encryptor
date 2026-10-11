namespace MaterialFileEncryptor.Core;

public readonly record struct TransferBufferStatistics(long ActiveReservedBytes,long PeakReservedBytes,long LimitBytes);

/// <summary>Process-wide conservative admission for owned transfer buffers, excluding caller-owned buffers and metadata.</summary>
public static class TransferBufferBudget
{
    public const long LimitBytes=64L*1024*1024;
    private static readonly object gate=new();
    private static long active,peak;
    public static TransferBufferStatistics Statistics {get{lock(gate)return new(active,peak,LimitBytes);}}
    public static IDisposable Reserve(long bytes,CancellationToken cancellationToken=default)
    {
        if(bytes<0||bytes>LimitBytes)throw new ArgumentOutOfRangeException(nameof(bytes));
        cancellationToken.ThrowIfCancellationRequested();
        var reservation=new Reservation(bytes);
        lock(gate)
        {
            // Never wait while a caller owns an engine lock or another buffer reservation.
            if(bytes>LimitBytes-active)throw new IOException("Transfer buffer budget is full. Retry after active operations finish.");
            active+=bytes;peak=Math.Max(peak,active);return reservation;
        }
    }
    private sealed class Reservation(long bytes):IDisposable
    {
        private long retained=bytes;
        public void Dispose(){long released=Interlocked.Exchange(ref retained,0);lock(gate)active-=released;}
    }
}
