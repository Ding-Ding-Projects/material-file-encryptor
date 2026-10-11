# Browser-local visitor access and private records

The visitor adapter mounts the existing local access workspace in the documentation website. It registers and unlocks a browser-local profile, exposes the shared authenticator and convenience-lock controls after authentication, and locks private history when the profile locks. This profile is independent of any desktop drive, server account, email address, or connection pairing.

## Registration and authentication

Enter a local profile password and choose **Set up local profile**. Later visits begin locked; enter that password and choose **Unlock local profile**. **Log out**, page exit, and relevant changes from another same-origin tab lock the session. A failed password does not activate the authentication callback or private wording. Existing shared password-wait behavior remains in use.

The shell receives `onAuthentication(true)` only after the shared profile has verified the password and derived its cache key. It must pass that state to its existing private-wording loader. Locking emits `false` immediately. The adapter itself supplies no private wording or default replacement data.

## Protected storage

The browser credential adapter stores a version-2 salted password verifier and encrypts authenticator secrets, lock records, the mode-unlock verifier, and the private-history verifier with the shared AES-GCM profile key. Password verification and cache-key derivation use distinct purposes with 310,000 PBKDF2 iterations. Encryption binds each record to its identity. Raw passwords are not stored. Stored record names and the profile verifier are visible metadata; encrypted content remains subject to offline password guessing.

Credential writes require browser Web Locks or an explicitly supplied equivalent. Unsupported browsers report the missing capability instead of storing plaintext. Each authenticated session binds the exact verifier record used by the shared profile login, and protected operations compare that identity with persisted storage. Writes check it under the write lock before and after asynchronous sealing. A stale tab cannot recreate encrypted records after profile removal or replacement even when its storage event is delayed. Pending writes are also invalidated by local profile lock or reset. Records have a 256 KiB plaintext bound and a 2 MiB stored-envelope read bound. This is local storage encryption, not protection from malicious scripts executing on this origin, a compromised browser, or access to an already unlocked session.

Private history uses the existing shared history manager and a separate history password. Its verifier is additionally protected by the profile. History entries use authenticated encryption and a checked hash chain. Credential, secret and personal-wording fields are omitted from snapshots. Locking the profile also locks history. The personalization surface must receive the adapter’s `historyManager`, `historyCredentialStore`, and authentication changes; mounting this adapter alone does not wire that surface.

## Authenticators, locks and support

The shared workspace provides real local TOTP registration, code confirmation and generation, QR import/reveal, and convenience locks. Browser clipboard and camera operations retain their actual permission and API requirements; unavailable operations report unavailable. Secrets are loaded only after profile authentication. Locking destroys and remounts the workspace to discard in-memory authenticator entries and clear sensitive fields. Convenience locks control interface actions and do not encrypt documents or prevent a same-origin script from changing controls.

Support tickets are session-only. They can be created, edited, selected and explicitly exported through the shared workspace. No ticket is submitted to a server, and locking or closing the page clears the session ticket list. Review exported descriptions before sharing them. Desktop data-folder actions are removed from this visitor surface.

## Recovery and destructive reset

Forgotten profile or history passwords cannot recover encrypted content. Clear this browser’s storage for this website, then register a new profile. There is no email or server reset. Browser-wide storage clearing also removes other preferences for this origin.

The narrower **Reset visitor records** action removes this adapter’s profile, authenticator, lock, waiting-state and private-history namespaces while retaining unrelated browser keys. It uses the existing real destructive-confirmation workflow: operate both confirmation keys, move the slider to 100%, then choose Execute. Cancel or Emergency exit before execution leaves the records untouched. Completion preserves the Done control before rebuilding the locked registration surface. If missing Web Locks or a storage exception interrupts reset after the access workspace was destroyed, closing that confirmation rebuilds a usable locked profile surface and retains the original error. A partial storage failure does not claim that all records were removed.

## Integration and verification boundary

`mountVisitorAccess(container, options)` returns `authenticated`, `credentialStore`, `historyCredentialStore`, `historyManager`, `credentialCapabilities`, `lock`, `refresh`, `setLanguage`, `openLockWizard`, `bind`, action-guard forwarding and `destroy`. Options include `storage`, `foundation`, `onAuthentication`, `onHistoryAccess`, `language`, `schoolMode`, `withLock`, `confirmDestructive`, `notify` and `eventTarget`. `onHistoryAccess` receives `{ authenticated, historyManager, historyCredentialStore }`. The mode credential capability supports setting and verifying a password only after local profile authentication; it invents no native keychain or remote schedule service.

`encryptPrivateCache(value, purpose)` and `decryptPrivateCache(envelope, purpose)` forward authenticated shared-profile encryption without exposing its key. The bounded purpose participates in authenticated encryption. Both operations verify the persisted profile identity before returning. The public loader can use these methods for an isolated encrypted wording-cache envelope; locking must restore original wording and discard decrypted state. The adapter never stores an unencrypted wording payload.

Focused tests exercise real shared profile controls, encrypted credential persistence and tamper refusal, independent history authentication and redaction, cross-tab locking, pending-write cancellation, and the actual two-key slider workflow. These are behavior tests using the shared DOM fixture, not browser layout, accessibility, clipboard, camera, deployment or desktop-drive acceptance. Public-shell wiring and deployed runtime verification remain separate work.
