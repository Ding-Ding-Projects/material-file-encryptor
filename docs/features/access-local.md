# Local access components

`mountAccess(container, services)` mounts the access settings, authenticator registration and local support desk. It returns `destroy()`, `controller`, `load(ids)`, `refreshLocks()`, `openUnlock(id)`, `guard(id, callback, ...args)` and `bind(root)`.

The host supplies `credentialStore` with asynchronous `get`, `set` and `delete` operations backed by its operating-system credential vault. Missing vault access prevents UI registration. Never substitute plaintext settings or browser storage. `dataPath` and `openDataFolder` must reference the same application data directory. The support desk does not delete data or send network requests. `t(key)` may return localized copy, and `notify(message)` receives generic status only. `history.record` receives redacted lock mutation metadata.

## Protection model

Six independent policies cover PIN, password, PIN plus password, password plus TOTP, PIN plus TOTP and password plus PIN plus TOTP. Passwords and PINs use individually salted PBKDF2 SHA-256 verifiers with 310,000 iterations. TOTP uses RFC 6238 with SHA-1, SHA-256 or SHA-512, six through eight digits and configurable periods. Registration confirms a current code. Credentials are excluded from list metadata. Lock sessions exist only in memory and expire or end when the application closes. Wrong attempts trigger capped exponential waiting after five attempts.

`guard()` must wrap every protected callback, including keyboard shortcuts and command-palette routes. Capture-phase interception additionally stops pointer, keyboard, input, change, submit and drag events. This is a convenience feature and cannot protect against a user who controls the renderer or deletes local data. It does not encrypt user files.

AES-GCM cache helpers use a non-extractable session key, fresh IVs and a stable record identifier as authenticated additional data. A session key is deliberately not persisted. Persistent encryption requires a host-managed vault key, not an exported renderer key.

The local profile setup stores a salted verifier in the supplied vault. Explicit unlock derives a separate non-extractable AES-GCM key from the password and profile salt, then calls `onAuthenticatedChange(true)`. Logout and destruction discard the key and call `onAuthenticatedChange(false)`. `encryptPrivateCache(value, identity)` and `decryptPrivateCache(record, identity)` reject access while logged out. The host may persist only the returned ciphertext, and must clear any previously rendered private wording immediately on logout. The profile is local and does not create a network account or session. Five failed profile attempts trigger capped exponential waiting in the current renderer session; persistent attempt budgets require a host service.

## Current limitations

The host must assign stable identifiers and bind every protected element; automatic per-element context-menu discovery and anchored wizard placement are not complete. `openLockWizard(id, originElement)` populates the correct target, focuses the policy, and restores origin focus on cancellation. The wizard displays only the selected policy's factors and includes a PIN keypad. Removing a lock authenticates first. Timed and until-close sessions are implemented; one-activation duration is not implemented.

The local waiting-ladder class exercises nonce consumption, expiry, three skips per rolling hour, arithmetic progression and timed unique mole scoring. It is not connected to unlock waiting and must not be treated as an authoritative anti-abuse mechanism: challenges and grading are renderer-local, the dish prompt is a fixture, and persisted budgets or a privileged challenge service are not implemented. Winning never creates a credential session. Do not expose it as production authentication protection.

Authenticator URI/manual parameters, issuer/account/group editing, order persistence, substring/regular-expression search, deletion, live codes, next-code preview and vault index restoration are implemented. Edits require current-code confirmation and do not reveal the stored secret. Local QR rendering, QR/camera import, bulk management, clock-skew diagnostics, encrypted mutation history and authenticated export remain integration work. The visible availability line explicitly names unavailable QR routes. No external QR service is used. The support list is session-local, searchable, advances through local statuses and permits individual removal; it has no export or bulk management yet, and its fixed privacy disclosure is currently English. Full localization and built accessibility/layout verification remain pending.

## Verification

`node --test test/local-access.test.js` verifies every published RFC 6238 vector for all three algorithms and six/eight digits, salted verifiers, authenticated-cache identity mismatch, all six policies, independent sessions, expiry and ladder nonce/budget behavior. These tests verify the component logic, not complete host integration or a built visual surface.
