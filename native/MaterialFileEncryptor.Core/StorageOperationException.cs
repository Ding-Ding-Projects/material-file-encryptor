namespace MaterialFileEncryptor.Core;

internal enum StorageOperationStage { PartCreate, PartWrite, PartFlush, PartFinishRename, PartCleanup, MetadataTempCreate, MetadataWrite, MetadataFlush, MetadataReplace, MetadataCleanup }
public sealed class StorageOperationException : IOException
{
    public string StorageStage { get; }
    internal StorageOperationException(StorageOperationStage stage,Exception inner):base("Encrypted storage operation failed.",inner)
    {
        StorageStage=stage switch
        {
            StorageOperationStage.PartCreate=>"part-create",StorageOperationStage.PartWrite=>"part-write",StorageOperationStage.PartFlush=>"part-flush",
            StorageOperationStage.PartFinishRename=>"part-finish-rename",StorageOperationStage.PartCleanup=>"part-cleanup",
            StorageOperationStage.MetadataTempCreate=>"metadata-temp-create",StorageOperationStage.MetadataWrite=>"metadata-write",
            StorageOperationStage.MetadataFlush=>"metadata-flush",StorageOperationStage.MetadataReplace=>"metadata-replace",StorageOperationStage.MetadataCleanup=>"metadata-cleanup",
            _=>throw new ArgumentOutOfRangeException(nameof(stage))
        };
    }
    internal static void Run(StorageOperationStage stage,Action action)
    {
        try{action();}catch(Exception error) when(error is IOException or UnauthorizedAccessException){throw new StorageOperationException(stage,error);}
    }
}
