# Synthetic native performance benchmark

Run the repository's root `build.bat /s` first, then run this bounded verification project with the built native helper and an output JSON path:

```powershell
dotnet run --project native/MaterialFileEncryptor.Performance/MaterialFileEncryptor.Performance.csproj -c Release -- <built-native-host> <private-output-json>
```

The benchmark creates disposable synthetic vaults and a 256 MiB synthetic source file. It measures 60 seconds of helper idle CPU, normalized by logical processor count; actual JSON-protocol status and cancellation acknowledgements during import; sampled helper working/private memory; and a separate in-process legacy-edit allocation and encrypted-byte amplification measurement. An abrupt child exit verifies append-journal durability.

No installed drive is mounted, and no user vault or user file is accessed. The benchmark removes only its own newly generated temporary fixture and derived history directory. Store raw evidence outside tracked source because timing and process-capacity results describe the current machine. The JSON states measurement boundaries explicitly: helper CPU is not whole-computer performance, status latency is not renderer input latency, source buffer limits are not external heap measurements, and the allocation count covers only the in-process core operation.
