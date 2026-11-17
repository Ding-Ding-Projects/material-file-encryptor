using System.Reflection;
using System.Text.Json;
using MaterialFileEncryptor.Core;

static partial class Regression
{
    static readonly Type BridgeType = Assembly.Load("MaterialFileEncryptor.Host").GetType("MaterialFileEncryptor.Host.PartHydrationBridge", true)!;

    /// <summary>The host side of the hydratePart pipe exchange: request, answer, refusal, late answer and cancel.</summary>
    static async Task PartHydrationProtocol()
    {
        var events = new List<JsonElement>();
        var send = BridgeType.GetProperty("Send", BindingFlags.Static | BindingFlags.Public)!;
        var complete = BridgeType.GetMethod("Complete", BindingFlags.Static | BindingFlags.Public)!;
        var fetch = BridgeType.GetMethod("FetchAsync", BindingFlags.Static | BindingFlags.Public)!;
        send.SetValue(null, (Action<object>)(value => { lock (events) events.Add(JsonSerializer.SerializeToElement(value)); }));
        try
        {
            JsonElement Answer(object value) => JsonSerializer.SerializeToElement(value);
            string Accepted(object result) => JsonSerializer.SerializeToElement(result).GetProperty("accepted").GetRawText();
            var request = new PlacedPartFetch(new string('a', 32), "hub-1", "Docker Hub", @"C:\vault\source", @"C:\vault\cache\parts\" + new string('a', 32) + ".mfe." + new string('b', 32) + ".fetch.tmp");

            // Success: one event with the exact fields, answered by requestId.
            var success = (Task)fetch.Invoke(null, [request, CancellationToken.None])!;
            var sent = events.Single();
            Assert(sent.GetProperty("event").GetString() == "hydratePart" && sent.GetProperty("part").GetString() == request.PartId && sent.GetProperty("location").GetString() == "hub-1" && sent.GetProperty("destination").GetString() == request.DestinationPath, "hydratePart event fields are wrong");
            var id = sent.GetProperty("requestId").GetString()!;
            Assert(Accepted(complete.Invoke(null, [Answer(new { requestId = id, ok = true })])!) == "true", "The answer was not accepted");
            await success;
            Assert(Accepted(complete.Invoke(null, [Answer(new { requestId = id, ok = true })])!) == "false", "A repeated answer was accepted");

            // Refusal: the desktop message becomes an IOException; control characters are replaced.
            var refused = (Task)fetch.Invoke(null, [request, CancellationToken.None])!;
            id = events.Last().GetProperty("requestId").GetString()!;
            complete.Invoke(null, [Answer(new { requestId = id, ok = false, error = "Sign in to Docker Hub." })]);
            try { await refused; throw new Exception("A refused fetch succeeded"); } catch (IOException error) { Assert(error.Message == "Sign in to Docker Hub.", "Refusal message changed"); }

            // Cancel: the host withdraws the request and tells the desktop process.
            using var cancellation = new CancellationTokenSource();
            var cancelled = (Task)fetch.Invoke(null, [request, cancellation.Token])!;
            id = events.Last().GetProperty("requestId").GetString()!;
            cancellation.Cancel();
            try { await cancelled; throw new Exception("A cancelled fetch succeeded"); } catch (OperationCanceledException) { }
            Assert(events.Last().GetProperty("event").GetString() == "hydratePartCancel" && events.Last().GetProperty("requestId").GetString() == id, "Cancel was not sent");

            // Malformed answers are rejected.
            foreach (var bad in new object[] { new { requestId = "x", ok = true }, new { requestId = id }, new { ok = true } })
            { bool threw = false; try { complete.Invoke(null, [Answer(bad)]); } catch (TargetInvocationException error) when (error.InnerException is ArgumentException) { threw = true; } Assert(threw, "A malformed answer was accepted"); }
            Console.WriteLine("PASS hydratePart pipe exchange: answer, refusal, cancel and malformed answers");
        }
        finally { send.SetValue(null, null); }
    }
}
