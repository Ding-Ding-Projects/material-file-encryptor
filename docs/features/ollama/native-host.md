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

Only exact `https://ollama.com/download/windows` is accepted, and a native confirmation occurs before opening it. No installer is downloaded or executed. Tests use synthetic, non-executable files and injected signature responses, and exercise missing trust, explicit approval, changed bytes, folder confinement and fixed-URL confirmation. They do not establish a real Ollama publisher identity or claim a real runtime launch.
