namespace MaterialFileEncryptor.Host;

// A synchronous scope only: it must be disposed on its creating thread before
// awaiting. No process-wide priority or foreground callback priority is changed.
internal sealed class BackgroundPriorityScope : IDisposable
{
    private readonly Thread owner=Thread.CurrentThread;
    private readonly ThreadPriority original;
    private readonly bool changed;
    internal BackgroundPriorityScope(bool responsive)
    {
        original=owner.Priority;
        if(responsive&&OperatingSystem.IsWindows()&&original>ThreadPriority.BelowNormal)
        {owner.Priority=ThreadPriority.BelowNormal;changed=true;}
    }
    public void Dispose()
    {
        if(!changed)return;
        if(Thread.CurrentThread!=owner)throw new InvalidOperationException("Background priority scope crossed an asynchronous boundary.");
        owner.Priority=original;
    }
}
