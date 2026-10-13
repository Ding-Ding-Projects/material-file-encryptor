using System;
using System.Collections.Generic;

internal static class CleanupActions
{
    internal static void Run(Exception original, IEnumerable<Action> actions)
    {
        var failures = new List<Exception>();
        foreach (var action in actions)
        {
            try { action(); }
            catch (Exception error) { failures.Add(error); }
        }
        if (failures.Count == 0) return;
        if (original != null) failures.Insert(0, original);
        throw new AggregateException("Conversion cleanup failed.", failures);
    }
}

