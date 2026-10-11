# Local models

## Connect and recover

Open Local models and choose **Check runtime**. The feature contacts only `http://127.0.0.1:11434`, using documented Ollama endpoints. A successful version response proves API reachability. An unavailable response does not distinguish a missing installation from a stopped service. Install the official desktop package if needed, or open the installed Ollama application through the operating system launcher, then check again. This feature never installs or starts a service automatically.

The optional native runtime controller augments API health with executable discovery and native process inspection. It distinguishes a stopped detected installation, a missing runtime in the checked default/selected locations, a running or HTTP-responsive but unhealthy service, and an unknown inspection result. A custom installation outside those locations may require **Locate installed runtime**. Detection alone never launches a process.

**Open official installation guide** opens only the fixed official Windows download page after confirmation. This application does not download or execute an installer. **Start verified local runtime** is available only for a detected stopped executable that passed the host trust policy. It launches only `ollama.exe serve`, with `OLLAMA_HOST=127.0.0.1:11434` and `OLLAMA_NO_CLOUD=1`, and checks readiness. Failed readiness stops only the process started by this action. No model is pulled. The parent must supply an executable trust policy; without it, startup remains disabled.

The official installer reference is <https://ollama.com/download>. Bundled help remains available without internet access. The desktop host must mediate any installer navigation through its existing external-link allowlist.

## Store and local inventory

**Refresh official catalog** reads every family linked from the official catalog and every published tag linked from each family’s tag pages, following pagination. Refreshes use four bounded workers, a 30-second timeout per page, an 8 MiB limit per page and a 4,096-page limit. Each successful refresh records page hashes, aggregate SHA-256 identity, source URLs, timestamps, family and variant counts. Ollama publishes no independent total in this HTML interface, so completeness means all observed official pages, not an externally certified total. Markup changes or a missing family’s tags invalidate the refresh and preserve the last complete cache. A catalog cannot promise that the provider did not omit an unlinked record.

Installed and running local tags are merged with the catalog without removing local-only entries. Search supports plain text and an isolated regular-expression mode. Each expression runs in a disposable worker with a 150 ms wall-clock deadline, 128-character pattern limit, 10,000-row limit, 32,767-character per-row limit and 4 MiB total UTF-8 text limit. A new query or surface teardown terminates the previous worker. Invalid or timed-out searches clear old results so they cannot remain actionable. Filters cover state, capability, family, quantization and hardware-fit verdict. A result window limits rendered rows to 200 while filtering the entire bounded inventory. Refine the search for additional rows.

## Hardware and downloads

The native main-process adapter measures CPU inventory, RAM, available RAM and architecture through operating-system APIs. On Windows it runs one fixed, hidden, noninteractive PowerShell query for `Win32_VideoController`, bounded to 10 seconds and 1 MiB output. It reports GPU model, driver version and device status. It never builds a command from renderer input. `AdapterRAM` is retained only as reported adapter evidence, not usable VRAM, because it is not a trustworthy usable-memory measurement. GPU backend compatibility remains unknown until separately verified. Model-storage free space is measured only when the host supplies a verified absolute model-storage directory. Otherwise it remains unknown instead of using the application-data volume as a substitute.

Fit needs exact size, parameter, quantization and context-memory evidence. After inspecting an installed model, reported architecture dimensions can estimate an F16 key/value cache for a 2,048-token context. The dimensions, arithmetic and assumptions accompany the verdict. Unknown data remains Unknown; model names are never used to invent requirements. Storage estimates include a 20% allowance and do not guarantee sufficient space for concurrent downloads or other applications.

The pull cart is only a download queue. Review exact tags, known sizes, additional storage and available space, then confirm network use. Choose one to three simultaneous pulls. Byte progress is displayed only when Ollama supplies it. Installed models are skipped; partial failure never marks the batch successful. Cancel and retry individual failed/interrupted items without deleting installed models. State is saved to the private application data directory.

## Chat

Select an installed model, set system instructions and bounded parameters, and send a message. Responses stream locally and can be stopped or regenerated. Sessions can be selected, renamed and deleted through an explicit confirmation. Images require verified `vision` capability and are limited to four images of 1 MiB each. Context is bounded to 128 messages, individual text to 65,536 characters, requests to 6 MiB and responses to 16 MiB. One chat response runs at a time.

History and attachments are local sensitive data. Exports retain messages while removing recognizable credential assignments, bearer values, environment assignments and private path patterns; image bytes are omitted. Automatic redaction cannot identify every secret. Review exports locally before sharing. Neither message bodies nor attachment bytes are sent to telemetry or logs by this module. Single-response generation uses the same bounded local model selection but does not append to a chat session. Installed models can be copied into one of three guided local tag destinations, and deleted only after typing the exact tag in the host confirmation control.

## Profiles and integration

The built-in Local chat and Model inspection profiles need no external process. External registration is host-only through an executable picker and allowlist verifier. Arguments are bounded and shell metacharacters rejected; environment values are refused. The host must provide a process launcher and readiness verifier before external launch is enabled. Preflight lists exact executable, arguments and directory. Working directories and required files must resolve inside parent-supplied owned roots. Executables and arguments must pass the parent’s exact executable-specific schema. These checks run again on load, preflight and restore, including real-path resolution to reject out-of-root paths.

The native profile adapter offers only version, installed-model listing and model-inspection recipes. Native pickers choose the verified `ollama.exe` and owned working directory. Argument vectors are fixed by the selected recipe; only the inspected model placeholder is replaced with a validated local tag. Execution has a 15-second timeout and 1 MiB output limit. Captured output is discarded; readiness is the actual successful command exit, not an assumed running state. Failed exit activates the existing snapshot rollback path.

Every launch durably records a snapshot and a starting state before invoking the launcher. Ready, failed and restored outcomes are persisted. A process interruption reloads as interrupted and never relaunches automatically. Failed readiness stops the returned owned process and restores the profile snapshot. These snapshots cover only application-owned profile configuration; the module never changes Ollama’s environment or server settings. Profile state is stored alongside the catalog, cart and sessions in the private application data file. Host launch and readiness adapters remain responsible for bounded execution and owned-process lifecycle.

Integration exports:

```js
createOllamaService({ dataDir, fetchImpl, hardwareProbe, profileLauncher,
  verifyExecutable, validateProfile, profileHealthCheck, profileOwnedRoots });
mountOllama(root, { services: { ollama: { request, subscribe } }, translate, confirm });

// Main process only; the directory must come from a verified native grant.
createNativeHardwareProbe({ modelStoragePath, storagePathVerified: true });

const profiles = createNativeProfileAdapter({
  pickExecutable, pickOwnedDirectory, verifyExecutable,
});
const runtime = createRuntimeController({
  pickExecutable, verifyExecutable, openOfficialPage,
  launchVerified: createVerifiedRuntimeLauncher({ verifyExecutable }),
});
// Additional createOllamaService options:
// runtimeController: runtime, profilePicker: profiles.pickProfile,
// profileLauncher: profiles.launcher, profileHealthCheck: profiles.healthCheck,
// verifyExecutable: profiles.verifyExecutable, validateProfile: profiles.validateProfile
```

The parent action allowlist must add `runtimeInstall`, `runtimeStart`, `chooseRuntimeExecutable` and `registerProfile`. Only `registerProfile` accepts a recipe identifier (`version`, `models`, `inspect`); paths come from native dialogs. Confirmations are required for installation-page navigation and startup. The runtime controller’s selected custom path is session-only; it is not a substitute for a persisted, revalidated external profile.

The host must verify caller identity for each action, authenticate its loopback adapter, enforce origin checks, restrict permissions to the application data directory, and destroy the service during teardown. `validateProfile` must approve the exact executable, arguments, working directory and required files against an executable-specific schema; executable identity alone is insufficient because an interpreter could execute arbitrary code. The renderer `confirm` callback defaults to refusing destructive/download actions. No direct renderer networking is necessary. `registerPickedProfile` is intentionally absent from the renderer action allowlist. Merge the exported `ollamaCantonese` dictionary into the host translator before mounting; locale changes remount the surface while the service retains state.

## Verification status

Focused synthetic tests exercise endpoint and payload boundaries, stream completion, pagination and stale cache retention, inventory reconciliation, all fit verdicts, profile rollback, durable profile restart/restore, native query argument bounds, persisted pull outcomes and redaction. Concurrent initialization regression verifies that readers and mutations join the same saved-state load. Neighboring tag metadata regression ensures missing values stay unknown. Actual disposable-worker tests verify pathological-expression termination while the main event loop continues, cancellation, bounds and invalid syntax. No model download, service installation, service start or built-interface capture is implied by these tests. The native probe has also been run read-only on the development host; that is a point-in-time hardware result, not model execution proof. Desktop bridge integration, all-language copy coverage, full visual matrix and authenticated browser parity require host integration and verification.

Primary references: [Ollama API](https://docs.ollama.com/api/introduction), [official catalog](https://ollama.com/library), and each family’s linked `/tags` page. The HTML catalog is not represented as a stable versioned API.
