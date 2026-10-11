using System.Text.Json;
using MaterialFileEncryptor.Host;

internal static class TransferPhaseRegression
{
    internal static async Task Run()
    {
        var names=new[]{"metadata","source-open","source-read","staging-begin","staging-write","install","activity"};
        foreach(var phase in Enum.GetValues<TransferPhase>())
        {
            var registry=new TransferOperationRegistry();
            registry.Start(["synthetic"],(_,_,progress)=>
            {
                if(phase==TransferPhase.Activity)progress(64,64,1,1);
                throw new TransferPhaseException(phase,new UnauthorizedAccessException("private synthetic detail"));
            });
            JsonElement result=default;
            for(int attempt=0;attempt<100;attempt++)
            {
                result=JsonSerializer.SerializeToElement(registry.Snapshot())[0];
                if(result.GetProperty("state").GetString()=="failed")break;
                await Task.Delay(10);
            }
            if(result.GetProperty("errorPhase").GetString()!=names[(int)phase]||result.GetProperty("errorCode").GetString()!="ACCESS_DENIED")throw new Exception("Safe phase classification mismatch.");
            if(result.GetRawText().Contains("private synthetic detail"))throw new Exception("Diagnostic exposed exception detail.");
            if(phase==TransferPhase.Activity&&result.GetProperty("completedFiles").GetInt32()!=1)throw new Exception("Installed file count was lost after activity failure.");
        }
        var untrusted=new Exception();untrusted.Data["phase"]="private arbitrary string";
        if(TransferPhaseException.GetSafePhase(untrusted)!=null||TransferPhaseException.GetSafePhase(new TransferPhaseException((TransferPhase)999,untrusted))!=null)throw new Exception("Unrecognized phase was published.");
        Console.WriteLine("PASS safe transfer phases, access classification, detail redaction and installed count retention");
    }
}
