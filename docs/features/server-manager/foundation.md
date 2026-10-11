# Server manager foundation

This unit supplies authoritative Java version discovery, selected-version server-distribution metadata resolution, source-bound configuration descriptors, typed configuration controls, and an explicit four-target capability inventory. It does not install or execute a server, accept a license, contact an SSH host, adopt a process/container, or modify an existing configuration.

## Catalogue and provenance

`refreshJavaCatalogue` reads the complete official Mojang version manifest with a ten-second timeout, a four-MiB response bound, HTTPS origin restrictions and redirect rejection. Every returned version is retained, including historical channels. Duplicate identities, missing latest entries and untrusted metadata URLs are rejected. The snapshot records the exact source SHA-256 and retrieval time. `catalogueState` distinguishes current, stale, offline and unavailable snapshots. Offline never means current.

`resolveJavaDistribution` checks the selected version metadata against the manifest's SHA-1 before reading its dedicated-server entry. Missing server downloads are explicitly unavailable. Historical Java runtime requirements remain unresolved when official metadata omits them. A resolved download records URL, SHA-1 and size, but does not claim downloaded-byte verification, installation, runtime verification or EULA consent. A complete authoritative historical Bedrock distribution catalogue remains unavailable; current download pages cannot fill that gap.

## Configuration and target boundaries

Descriptors require edition, exact version, verified distribution SHA-256, authoritative source revision, help, permission, persistence consumer and live/restart semantics. Booleans map to switches, enumerations to searchable selectors, numbers to bounded numeric controls and text to text controls. The renderer accepts localized copy and a real action callback from its owner. Unknown extension data survives configuration patches unchanged; editing an unknown extension requires a real descriptor. A generic JSON or shell editor is not provided.

Local processes, local containers, SSH processes and SSH containers are independently inventoried with required identity and permission proofs. All runtime adapters are currently disabled and explicitly not implemented. Connection loss must never be represented as a stopped server.

## Integration handoff

Import the catalogue module only into the trusted host layer, with explicit refresh and owned cache persistence. Never expose arbitrary fetch URLs to the renderer. Bind configuration descriptors to an actually verified distribution and generated/version-reviewed defaults before enabling editing. Mount `mountConfigurationControls` through the existing localized surface and supply the established permission, confirmation, persistence and history action. Registry/navigation, optional above-control guidance, complete documentation/help, structured collection controls, native IPC, licensing, runtime lifecycle, extensions and real rendered acceptance remain integration or subsequent implementation work. No shared registry or navigation files changed in this unit.

Run `node --test test/server-manager.test.js`. These tests prove source behavior and negative inventory/configuration checks; they are not installed-server or GUI acceptance.
