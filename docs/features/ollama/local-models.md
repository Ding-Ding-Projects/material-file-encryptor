# Local models

## Connect and recover

Open Local models and choose **Check runtime**. The feature contacts only `http://127.0.0.1:11434`, using documented Ollama endpoints. A successful version response proves API reachability. An unavailable response does not distinguish a missing installation from a stopped service. Install the official desktop package if needed, or open the installed Ollama application through the operating system launcher, then check again. This feature never installs or starts a service automatically.

The official installer reference is <https://ollama.com/download>. Bundled help remains available without internet access. The desktop host must mediate any installer navigation through its existing external-link allowlist.

## Store and local inventory

**Refresh official catalog** reads every family linked from the official catalog and every published tag linked from each family’s tag pages, following pagination. Refreshes use four bounded workers, a 30-second timeout per page, an 8 MiB limit per page and a 4,096-page limit. Each successful refresh records page hashes, aggregate SHA-256 identity, source URLs, timestamps, family and variant counts. Ollama publishes no independent total in this HTML interface, so completeness means all observed official pages, not an externally certified total. Markup changes or a missing family’s tags invalidate the refresh and preserve the last complete cache. A catalog cannot promise that the provider did not omit an unlinked record.

Installed and running local tags are merged with the catalog without removing local-only entries. Search supports plain text and a restricted, bounded regular-expression mode. Filters cover state, capability, family, quantization and hardware-fit verdict. A result window limits rendered rows to 200 while filtering the entire inventory. Refine the search for additional rows.

## Hardware and downloads

Hardware refresh measures RAM, available RAM, architecture and free space. GPU, usable VRAM and driver support remain unknown unless the host supplies a verified probe. Fit needs exact size, parameter, quantization and context-memory evidence. Unknown data remains Unknown; model names are never used to invent requirements. Storage estimates include a 20% allowance and do not guarantee sufficient space for concurrent downloads or other applications.

The pull cart is only a download queue. Review exact tags, known sizes, additional storage and available space, then confirm network use. Choose one to three simultaneous pulls. Byte progress is displayed only when Ollama supplies it. Installed models are skipped; partial failure never marks the batch successful. Cancel and retry individual failed/interrupted items without deleting installed models. State is saved to the private application data directory.

## Chat

Select an installed model, set system instructions and bounded parameters, and send a message. Responses stream locally and can be stopped or regenerated. Sessions can be selected, renamed and deleted through an explicit confirmation. Images require verified `vision` capability and are limited to four images of 1 MiB each. Context is bounded to 128 messages, individual text to 65,536 characters, requests to 6 MiB and responses to 16 MiB. One chat response runs at a time.

History and attachments are local sensitive data. Exports retain messages while removing recognizable credential assignments, bearer values, environment assignments and private path patterns; image bytes are omitted. Automatic redaction cannot identify every secret. Review exports locally before sharing. Neither message bodies nor attachment bytes are sent to telemetry or logs by this module.

## Profiles and integration

The built-in Local chat and Model inspection profiles need no external process. External registration is host-only through an executable picker and allowlist verifier. Arguments are bounded and shell metacharacters rejected; environment values are refused. The host must provide a process launcher and readiness verifier before external launch is enabled. Preflight lists exact executable, arguments and directory. Every launch records a snapshot and failed readiness restores it. These snapshots cover profile configuration; the module never changes Ollama’s own environment or server settings. External profiles and snapshots currently live for the service session and are not persisted across application restarts.

Integration exports:

```js
createOllamaService({ dataDir, fetchImpl, hardwareProbe, profileLauncher,
  verifyExecutable, validateProfile, profileHealthCheck });
mountOllama(root, { services: { ollama: { request, subscribe } }, translate, confirm });
```

The host must verify caller identity for each action, authenticate its loopback adapter, enforce origin checks, restrict permissions to the application data directory, and destroy the service during teardown. `validateProfile` must approve the exact executable, arguments, working directory and required files against an executable-specific schema; executable identity alone is insufficient because an interpreter could execute arbitrary code. The renderer `confirm` callback defaults to refusing destructive/download actions. No direct renderer networking is necessary. `registerPickedProfile` is intentionally absent from the renderer action allowlist. Merge the exported `ollamaCantonese` dictionary into the host translator before mounting; locale changes remount the surface while the service retains state.

## Verification status

Focused synthetic tests exercise endpoint and payload boundaries, stream completion, pagination and stale cache retention, inventory reconciliation, all fit verdicts, profile rollback, persisted pull outcomes and redaction. No model download, service installation, service start, real GPU measurement or built-interface capture is implied by these tests. Desktop bridge integration, all-language copy coverage, full visual matrix, authenticated browser parity, persistent external profiles and production hardware probes require host integration and verification.

Primary references: [Ollama API](https://docs.ollama.com/api/introduction), [official catalog](https://ollama.com/library), and each family’s linked `/tags` page. The HTML catalog is not represented as a stable versioned API.
