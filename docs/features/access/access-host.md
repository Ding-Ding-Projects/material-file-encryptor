# Privileged access host integration

The access host implements authoritative password/PIN/TOTP verification, persisted attempt deadlines, one-use waiting challenges and a three-success rolling-hour budget. The renderer cannot nominate its actor, School mode or a new deadline. Winning a waiting challenge only ends waiting; it never authenticates a profile or element.

## Integration contract

Create one `createAccessHost({dataDirectory, credentials, getActor, getSchoolMode})` per protected host lifetime. `getActor` must derive identity from the verified main-frame sender. `getSchoolMode` must read trusted native shared settings. Never copy either value from a renderer request. Call `validateAccessHostRequest(action, payload)` at the bridge boundary and retain the existing feature/schema validation.

The protected store must provide asynchronous `get`, `set`, `delete`, `list` and `readVersioned(key) and compareAndSetVersioned(key, expectedRevision, replacement)`. Versioned reads return a value and its protected persistent revision. Conditional writes return updated and a new revision, comparing within the store's existing serialization queue. All writers, including same-value writes and deletions, replace that receipt; deleted keys retain a tombstone. Null replacement means deletion. A mismatched revision stops rollback even when another writer restored an identical value. History setup and mutations fail closed when this atomic operation is unavailable.

Route the exported `ACCESS_HOST_ACTIONS` through `host.request`. Route every renderer authenticator credential set/delete through `host.setCredential` and `host.deleteCredential`; preserve existing credential key allowlists. Reserved `lock:` and `profile:` host records remain inaccessible to renderer credential APIs. Close the host on teardown.

Supply `services.accessHost(action,payload)` to the access mount. Supply personalization `services.recordDisplayName(value)` using `displayNameSet`, load `displayNameRead` before its initial mount, and apply the restored name from the access mount's `onDisplayNameRestore` callback. A restoration must update the displayed preference without creating a second unintended mutation.

## Encrypted local history

History has a separate password and a ten-minute grant bound to the trusted actor. Profile authentication never grants history access. AES-256-GCM snapshots cover authenticator records and the display name. Only ciphertext and nonsensitive action names enter the private application-data Git repository. A protected tail digest detects missing or rolled-back envelopes. Keys stay in operating-system protected storage.

Changes are serialized and use compare-and-set writes. Recording failures restore only the values owned by that operation; a concurrent writer is preserved and the caller receives a recovery error. Successful restore appends a new entry instead of rewriting prior commits. Labels, date/action filtering, redacted comparison/export, retention and confirmed pruning are available in the Material history panel.

Pruning hides expired entries from the manager. Historical encrypted commits remain, so this does not promise secure erasure or disk-space reclamation. Forgotten history passwords have no recovery or reset route. Before recording an envelope, a protected pending intent binds its exact ciphertext hash, prior tail and relative record identity. An interrupted tail write can recover only that attested committed envelope after checking both Git content and the current file. Recovery preserves the committed record and appends a compensation after an owned rollback. Unattested, altered or missing records stop for explicit local recovery. This is not an atomic transaction across two storage systems.

## Availability and verification

A working supported Git executable is required. Missing Git fails before password setup persists. Installer provisioning and production bridge wiring are separate integration requirements; source tests do not establish their availability in a packaged application. Browser-only execution cannot supply this privileged boundary.

Synthetic tests in `test/local-access-host.test.js` exercise real temporary Git recording, encrypted files, redacted export, replay/expiry/actor boundaries, persistent budgets, cancellation, atomic rollback, concurrent changes, missing runtime and independent password expiry. No real vault or user credential is used. Built visual, native sender and packaged integration acceptance remain pending until separately recorded.

## Recovery before the first commit

The encrypted envelope is written and synchronized in the dedicated staging directory before the protected pending intent is stored. That intent binds the staging and final relative paths plus ciphertext hash and prior tail. On restart, a missing commit can be completed only from those attested bytes, whether they are still staged or already at the final path. Unexpected content, symbolic links or missing attested bytes stop recovery without deletion or replacement. Unreferenced staging files are retained, not silently discarded.

## Redacted bootstrap mutation journal

The host creates `createAccessMutationHistory({dataDirectory, toolsDirectory})` and injects `event => journal.record(event)` as the integration adapter's `recordMutation` callback. It closes the journal alongside the adapter. No profile or encrypted-history password is required for this bootstrap writer, so initial profile and element-lock setup can record their lifecycle.

Only version, fixed action, stable target and UTC timestamp enter this journal. Credential values, factors, actors and arbitrary payloads are rejected. The writer uses the verified bundled Git executable, serializes operations, synchronizes a pending immutable metadata file, commits the exact final record, verifies its committed bytes and only then reports success. An interrupted operation retains pending evidence; a later call or process instance recovers it before accepting new work. Content-bound filenames detect changed bytes. Unknown pending files or mismatched records stop recovery without deletion.

Records live in the local application-data `access-mutations/records` directory, separately from encrypted authenticator and display-name snapshots. The host-only `list({limit})` API discovers them in timestamp order with a maximum of 1,000 returned rows. An authenticated manager can merge this redacted inventory with its other views through the owning host; no unrestricted renderer action or credential-key exception is added by the writer. Manager bridge/display integration remains a separate explicit wiring step. This metadata is not an authentication authority and does not replace encrypted snapshots.

The integration rechecks the same profile grant, generation and expiry after asynchronous reads and before returning private history. A cancelled private-history write restores only its own versioned result. `test/local-access-integration.test.js` covers cancellation at grant-read, stored-write and returned-read boundaries. `test/local-access-mutation-history.test.js` covers actual temporary Git commits with a synthetic resolver/executor fixture; it does not claim that the packaged native executable was launched.
