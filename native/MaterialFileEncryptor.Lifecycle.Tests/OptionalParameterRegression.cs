using System.Text.Json;
using MaterialFileEncryptor.Host;

internal static class OptionalParameterRegression
{
    internal static void Run()
    {
        using var document = JsonDocument.Parse("{\"cursor\":null,\"revision\":null,\"limit\":100,\"bad\":\"100\"}");
        var parameters = document.RootElement;
        foreach (string field in new[] { "cursor", "revision", "missing" })
            if (VaultController.OptionalLong(parameters, field) is not null)
                throw new Exception("An absent pagination value must retain its default.");
        if (VaultController.OptionalLong(parameters, "limit") != 100)
            throw new Exception("A supplied page limit was not retained.");
        try
        {
            VaultController.OptionalLong(parameters, "bad");
            throw new Exception("A string was accepted as a numeric pagination value.");
        }
        catch (InvalidOperationException) { }
        if (TransferOperationRegistry.ClassifyFailure(new IOException("sensitive fixture detail")) != "STORAGE_IO_FAILED"
            || TransferOperationRegistry.ClassifyFailure(new InvalidOperationException("sensitive fixture detail")) != "INVALID_OPERATION")
            throw new Exception("Transfer failure diagnostics must use bounded categories, not exception text.");
        Console.WriteLine("PASS nullable pagination parameters retain defaults and reject non-numeric values");
    }
}
