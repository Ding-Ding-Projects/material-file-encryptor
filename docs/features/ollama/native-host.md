# Native Ollama host boundary

`src/main/ollama-host.js` supplies native dialog, trust, owned-directory and external-link callbacks for the runtime and profile adapters. It does not wire IPC, alter process-wide settings, download files or execute a target as a trust probe.

```js
const host = createNativeOllamaHost({
  dialog, getWindow, openExternal, credentials, dataDirectory,
  reviewedManifests: [], publisherPolicies: [],
});
await host.initialize();
const runtime = createRuntimeController(host.runtimeOptions);
const service = createOllamaService({
  dataDir: path.join(dataDirectory, 'local-models'),
  ...host.serviceOptions,
  runtimeController: runtime,
});
```

The working-directory root is exactly `dataDirectory/local-models/profiles`. Existing parent directories are checked before each child is created. Native selection rejects redirected paths, symlinks, non-directory selections and folders outside that root. Executable selection accepts only a real regular `ollama.exe`, then applies actual trust policy; the basename is not trust.

## Default trust limitation

The official Windows documentation establishes installation locations and supported launch behavior. The official releases expose archive hashes. Neither fact, by itself, establishes the exact Authenticode publisher identity or the hash of the extracted executable. This implementation intentionally ships no guessed publisher identity and no invented executable manifest. With both trust lists empty, execution remains disabled even when an installation is detected.

Primary sources: [official Windows documentation](https://docs.ollama.com/windows), [official releases](https://github.com/ollama/ollama/releases). An archive digest must never be substituted for the extracted member digest.

An established publisher policy contains an exact certificate subject, optional exact certificate thumbprint and official provenance URL. The host must obtain and review that provenance independently before supplying it. The native inspector reads `Get-AuthenticodeSignature` using a fixed system PowerShell executable, rejects non-Valid signatures, and compares the full subject exactly. It never runs the inspected executable.

## Explicit pinned-manifest route

A main-process-only reviewed manifest has these fields:

```json
{
  "sha256": "<exact extracted executable SHA-256>",
  "bytes": 123,
  "version": "<reviewed release version>",
  "sourceUrl": "https://github.com/ollama/ollama/releases/download/<tag>/<asset>",
  "artifactSha256": "<verified source archive SHA-256>",
  "member": "ollama.exe"
}
```

The manifest is trusted configuration supplied by the parent, never a renderer upload or an executable's own claim. It must be derived from reviewed official source provenance and independently verified archive extraction. Merely attaching an official-looking URL does not establish that derivation. The constructor defaults remain empty. The separately exported [reviewed release constants](./release-provenance.md) can be supplied explicitly after host integration review.

When selected bytes match a supplied reviewed manifest, the native confirmation displays the exact path, executable digest, source archive digest, version and provenance. Cancel is the default. The executable is rehashed after confirmation, and changed bytes prevent approval. The protected store records approval under `profile:ollama-trust:<manifest identity>`. Every later verification and pre-launch check rereads the file and compares its current hash. Selection alone never approves it. The parent must retain the existing boundary that makes `profile:` records inaccessible to renderer credential reads.

Hash checks narrow the replacement window but are not an operating-system executable-handle lock. Native package installation permissions and the host filesystem boundary remain necessary; this module does not claim to defeat a concurrent same-account attacker who can replace executable paths between verification and process creation.

## External navigation and verification

## Local endpoint configuration

The native constructor accepts `loopbackPort`, an integer from 1024 through 65535, defaulting to 11434. No hostname, URL, environment map or model-directory path is accepted from a renderer. `runtimeOptions` and `serviceOptions` carry that port to the runtime controller and API client respectively. Health probes, fixed launch validation and native execution confirmation use the same endpoint. Profile commands use that endpoint too.

New owned runtime launches set `OLLAMA_MODELS` to `dataDirectory/local-models/runtime-models`. The directory is created and checked through the same canonical no-redirection boundary as profile storage immediately before launch. It does not migrate or modify an existing external runtime's model store. `host.managedModelDirectory` and `host.initializeModels()` are available for native hardware measurement and startup preparation.

Runtime status exposes `endpoint`, `managedModelStoreConfigured` and `managedModelStore`. The last field is true only after this controller owns a runtime launch, never merely because an external API responds. `runtime.dispose()` stops only its returned owned process; service disposal first cancels and waits for pending API operations, then disposes the runtime. An external runtime is not stopped.

Configuration is immutable for each constructed instance. The desktop owner must enforce idle state, show native confirmation, dispose the old service and owned runtime, persist the selected numeric port atomically, then reconstruct both objects. The renderer invokes the optional `services.ollama.configureRuntime({port})` desktop bridge. Browser adapters must not expose that privileged configuration operation. The UI displays the actual endpoint and managed-store state. Configuration must not change under pending requests.

Native process inventory explicitly serializes the PowerShell array through `ConvertTo-Json -InputObject`. An empty pipeline must produce `[]`, not empty output: otherwise an installed stopped runtime is misclassified as unknown and cannot start. The empty-inventory regression and a read-only native probe cover this case. This correction alone does not establish model pull or chat behavior in the packaged application.

Runtime start and each profile execution require a native confirmation naming the trusted executable, fixed action and loopback boundary. Cancel is the default and raises `USER_CANCELLED` before process creation. Renderer confirmation fields do not replace this dialog. Both profile adapter and service launcher exports share the same wrapper. Trust verification remains read-only and never displays a prompt; the underlying launchers recheck trust after the execution confirmation.

Only exact `https://ollama.com/download/windows` is accepted, and a native confirmation occurs before opening it. No installer is downloaded or executed. Tests use synthetic, non-executable files and injected signature responses, and exercise missing trust, explicit approval, changed bytes, folder confinement and fixed-URL confirmation. They do not establish a real Ollama publisher identity or claim a real runtime launch.
