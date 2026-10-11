# Privileged access host integration

The access host implements authoritative password/PIN/TOTP verification, persisted attempt deadlines, one-use waiting challenges and a three-success rolling-hour budget. The renderer cannot nominate its actor, School mode or a new deadline. Winning a waiting challenge only ends waiting; it never authenticates a profile or element.

## Integration contract

Create one `createAccessHost({dataDirectory, credentials, getActor, getSchoolMode})` per protected host lifetime. `getActor` must derive identity from the verified main-frame sender. `getSchoolMode` must read trusted native shared settings. Never copy either value from a renderer request. Call `validateAccessHostRequest(action, payload)` at the bridge boundary and retain the existing feature/schema validation.

The protected store must provide asynchronous `get`, `set`, `delete`, `list` and `compareAndSet(key, expected, replacement)`. The last method compares and writes within the store's existing serialization queue. Null represents absence or deletion. False means the expected value changed. History setup and mutations fail closed when this atomic operation is unavailable.

Route the exported `ACCESS_HOST_ACTIONS` through `host.request`. Route every renderer authenticator credential set/delete through `host.setCredential` and `host.deleteCredential`; preserve existing credential key allowlists. Reserved `lock:` and `profile:` host records remain inaccessible to renderer credential APIs. Close the host on teardown.

Supply `services.accessHost(action,payload)` to the access mount. Supply personalization `services.recordDisplayName(value)` using `displayNameSet`, load `displayNameRead` before its initial mount, and apply the restored name from the access mount's `onDisplayNameRestore` callback. A restoration must update the displayed preference without creating a second unintended mutation.

## Encrypted local history

History has a separate password and a ten-minute grant bound to the trusted actor. Profile authentication never grants history access. AES-256-GCM snapshots cover authenticator records and the display name. Only ciphertext and nonsensitive action names enter the private application-data Git repository. A protected tail digest detects missing or rolled-back envelopes. Keys stay in operating-system protected storage.

Changes are serialized and use compare-and-set writes. Recording failures restore only the values owned by that operation; a concurrent writer is preserved and the caller receives a recovery error. Successful restore appends a new entry instead of rewriting prior commits. Labels, date/action filtering, redacted comparison/export, retention and confirmed pruning are available in the Material history panel.

Pruning hides expired entries from the manager. Historical encrypted commits remain, so this does not promise secure erasure or disk-space reclamation. Forgotten history passwords have no recovery or reset route. A failure between Git commit and protected-tail persistence stops history for explicit local recovery. It is not described as an atomic transaction across two storage systems.

## Availability and verification

A working supported Git executable is required. Missing Git fails before password setup persists. Installer provisioning and production bridge wiring are separate integration requirements; source tests do not establish their availability in a packaged application. Browser-only execution cannot supply this privileged boundary.

Synthetic tests in `test/local-access-host.test.js` exercise real temporary Git recording, encrypted files, redacted export, replay/expiry/actor boundaries, persistent budgets, cancellation, atomic rollback, concurrent changes, missing runtime and independent password expiry. No real vault or user credential is used. Built visual, native sender and packaged integration acceptance remain pending until separately recorded.
