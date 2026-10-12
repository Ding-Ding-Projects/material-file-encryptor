# Privileged access host integration

The privileged host verifies passwords, PINs and TOTP, persists failed-attempt deadlines, grades one-use waiting challenges and enforces three successful waiting skips per rolling hour. Winning a challenge only ends waiting. It never authenticates a profile, unlocks an element or grants history access.

Waiting answers require dense arrays with an own data property at every index. Inherited indices, accessors, extra properties and missing elements are rejected before grading. The host schema, direct challenge service and sum/timed-round grader enforce this independently. An invalid answer cannot clear the stored deadline or consume a successful skip, and even a correctly solved round never authenticates the caller.

## Production factory and trusted identity

Create one adapter for the protected main-frame lifetime:

```js
const journal = createAccessMutationHistory({dataDirectory, toolsDirectory});
const access = createAccessIntegration({
  dataDirectory,
  toolsDirectory,
  credentials,
  getMainFrame,
  recordMutation: event => journal.record(event)
});
```

The adapter exposes `request(senderFrame, action, payload)`, `supports(action)` and `close()`. The trusted main handler validates its request source, then constructs `{senderFrame: event.senderFrame}` as the feature-service context. `getMainFrame` returns the current main-owned frame object. The adapter requires reference identity, derives its own actor identifier and keeps it in asynchronous request context. It rechecks that identity after asynchronous work. A renderer payload cannot nominate an actor or frame.

A loopback or other caller with no verified frame has no actor and is rejected. Never substitute the current frame to make an untrusted request work. Close the adapter and journal during teardown. Closing revokes grants and aborts their owned Git processes.

## Authoritative mode and executable

School mode comes from the native application-data `shared-settings.json` file. Missing initial settings mean disabled; malformed, oversized or symbolic-link settings stop the operation. The renderer cannot override this value or a waiting deadline.

The host uses `createForgeToolResolver(toolsDirectory)` and the trusted package's `forge-executables.json`. Every process invocation verifies the bundled executable's path and actual hash, then checks `git version 2.56.0.windows.2`. It never selects Git from PATH or accepts a renderer-supplied digest. Missing or changed tools stop recording. Packaged executable verification remains separate from a synthetic test executor.

## Request and protected-store contract

The adapter routes every action in `ACCESS_HOST_ACTIONS`, plus `credentialGet`, `credentialSet`, `credentialDelete` and `credentialList`. Existing data-folder actions remain with their current handler. Retain outer bridge validation; the adapter additionally calls `validateAccessHostRequest` or its exact credential schema and snapshots validated payloads before queueing them.

The store supplies `get`, `set`, `delete`, `list`, `readVersioned(key)` and `compareAndSetVersioned(key, expectedRevision, replacement)`. A versioned read returns value and revision. A conditional write compares and writes inside the store queue and returns updated status plus revision. Every successful writer changes the protected persistent receipt, including same-value writes and deletion. Deleted keys keep a revision tombstone; null replacement means deletion. Value comparison alone cannot protect rollback from a later writer that returns to the same value.

Reserved `lock:` and `profile:` host records are unavailable through renderer credential APIs. The renderer cannot read or replace history keys, pending intents, attempt counters or actor grants.

## Credential writer admission

Authenticator changes and display-name changes require the separately authenticated encrypted-history service. Initial profile and element-lock creation do not require a history password. They use create-only versioned writes and await a redacted general-history record before reporting success.

Creation cannot overwrite an existing credential. The current interface authenticates and removes an existing lock before creating a replacement; it does not silently gain a credential-reset endpoint. Removal requires a recent successful verification bound to the actor, target and unchanged record revision, or the same actor's unexpired creation receipt for cancellation of its own creation. A new frame cannot reuse that receipt.

Legacy `history:*` reads and writes require a verified profile. `waitCancel` revokes the matching target grant. History operations retain the same grant identity, generation and expiry through asynchronous reads and recheck them before returning data. If cancellation arrives during a stored write, rollback restores only that write's own revision. Concurrent later writes are preserved and reported for recovery.

The general-history callback receives only `{version, action, target, at}`. Missing recording capability stops profile or element mutation before writing. A recording failure restores the owned credential revision and attempts a redacted rollback record. It never reports a successful mutation when durable recording failed.

## Renderer integration

Supply `services.accessHost(action, payload)` through the production feature bridge. Supply personalization `services.recordDisplayName(value)` using `displayNameSet`, read `displayNameRead` before mounting its initial preference, and apply an authorized restored name through `onDisplayNameRestore`. Restoration must not create a second unintended mutation. Other name-changing routes, including preference reset, need the same authorized recording route.

The history tab appears only when its host adapter is supplied. It has an independent password, explicit setup/unlock/lock controls, full search, date and action filters, labels, comparison, redacted export and confirmed restore/retention/prune operations. Profile authentication never opens history implicitly.

## Encrypted history and ownership

Encrypted history grants last ten minutes and are bound to the trusted actor. AES-256-GCM snapshots contain authenticator records and display name. Only ciphertext and nonsensitive action names enter the local application-data Git repository. Encryption keys and the tail digest stay in operating-system protected storage.

Changes are serialized and use persistent revision receipts. Recording failure restores only values still owned by that operation. Restoration appends a new entry instead of rewriting earlier commits. A later writer's identical value is still a different owned revision and must not be overwritten.

Pruning hides expired entries from the manager. Historical encrypted commits remain, so pruning is neither secure erasure nor disk-space reclamation. Forgotten history passwords currently have no recovery or reset route. This implementation does not claim an atomic transaction across the credential store and Git.

## Interrupted encrypted-record recovery

The encrypted envelope is written and synchronized in a dedicated staging directory before the protected pending intent. That intent binds staging and final relative paths, exact ciphertext hash and prior protected tail.

After interruption, the host may complete a missing commit only from the attested staged or final bytes. It verifies committed content and the current file before advancing the protected tail. A failed tail write can therefore recover the already committed record and append compensation after an owned rollback. Unknown content, symbolic links, changed ownership or missing attested bytes stop recovery without deleting or replacing them. Unreferenced staging files remain retained.

## Redacted bootstrap journal and manager discovery

The bootstrap journal records only version, fixed action, stable target and UTC timestamp. Credential values, factors, actors and arbitrary payloads are rejected. No profile or encrypted-history password is required, allowing initial setup to record its lifecycle.

It serializes operations, synchronizes an immutable pending metadata file, commits the exact final record using verified bundled Git, verifies committed bytes, and only then reports success. Content-bound filenames detect changes. A later call or process instance recovers pending records before accepting new work. Unknown pending files and mismatched bytes stop recovery and remain preserved.

These records live in the local application-data `access-mutations/records` directory, separately from encrypted snapshots. The host-only `list({limit})` method returns at most 1,000 rows in timestamp order. An authenticated manager can discover and merge this inventory through its owning host. The writer adds no unrestricted renderer endpoint or credential-key exception. Manager bridge and display wiring remain explicit integration work. The journal is metadata, not an authentication authority or a replacement for encrypted snapshots.

Every bootstrap-journal and encrypted-history command and its executable-version check receive an isolated process environment. Inherited Git routing, index, object, configuration, template, helper and trace variables are removed. Global and system configuration are disabled, interactive prompts and filesystem monitoring are disabled, and external attributes are excluded. The normal operating-system launch environment is retained. This prevents a parent process from redirecting either history into a different repository or trace file.

## Verification and remaining boundaries

`test/local-access-host.test.js` covers protected challenges, persistent budgets, independent history grants, encrypted temporary Git records, revision ownership and interrupted recovery. `test/local-access-integration.test.js` covers trusted-frame admission, reserved keys, native settings, executable tampering, recording failure and cancellation at grant-read, stored-write and returned-read boundaries. `test/local-access-mutation-history.test.js` exercises actual temporary Git commits with a synthetic resolver and executor fixture; it does not claim that the packaged native executable ran.

All fixtures use synthetic data, not a real vault or user credential. Historical intermittent Node WebCrypto disagreement remains unresolved unless separately closed by source-bound runtime evidence. A successful packaged-browser comparison does not establish a main-runtime verdict. Production sender wiring, installed executable availability, manager discovery, built visual acceptance and cryptographic runtime acceptance require their own recorded evidence.
