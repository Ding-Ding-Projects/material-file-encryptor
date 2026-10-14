## Blocking independent review findings

Independent review found two defects in this inactive foundation. First, replacing the native local profile after preparation does not invalidate the retained authorization closure: a synthetic causal run changed that profile revision and the old reset still committed. Approval must recheck the exact authenticated revision across commit and asynchronous mutation boundaries. Second, interruption after a compensating record restore but before journal progress is saved causes recovery to interpret its own new revision as a concurrent conflict. Compensation and journal progress need atomic persistence, without weakening concurrent-write or ABA protection. Do not enable or integrate this candidate until both causal scenarios pass independent review. Renderer reset actions remain unavailable.

# Protected preference reset transaction

## Native coordinator and current boundary

`protected-settings-reset.js` provides a host-only transaction for the canonical encrypted `profile:preferences:v1` record and, when explicitly selected, the protected display-name record. This is foundational implementation, not a delivered desktop reset workflow. Existing desktop preference writers still use browser storage. The renderer continues to reject a combined reset until all those writers adopt the native authority and the exact preview is connected to the existing confirmation controls. No real profile is automatically migrated.

The native integration exposes `requestSettingsReset(senderFrame, action, payload)` to trusted main-process wiring only. It is deliberately absent from the renderer IPC action inventory. `prepare` takes an exact boolean `includeDisplayName`; `commit` and `abort` take the preview identifier. Main-process integration must retain opaque sender-frame identity, use the existing authorized request dispatcher, and never expose arbitrary file or executable access.

## Preview, authorization and preservation

Preparation requires the current verified local profile and independently unlocked encrypted access history. It returns a one-use identifier, expiration, affected preference keys, bounded before/after presentation, selected display-name change and preserved-data inventory. Free-form preference text, vocabulary mappings, custom images, credentials and authenticator values are omitted from the preview. The display name is included only when selected. Shared mode is preserved rather than implicitly disabled by a preference reset.

Approval is bound to the actor, profile authorization lifetime, native preference revision, selected display-name revision, scope and expiration. A newer revision, including a same-value intervening write, invalidates the preview. Cancellation removes the actor's pending preview; closing the service removes all pending previews. Commit consumes its preview before any mutation, so a retry must obtain fresh approval.

Reset authorization rereads the protected profile revision across asynchronous boundaries and retains the exact revision originally verified for that actor. The prepared-journal write, selected-record application and completion write also require that profile revision under the same protected-store writer lock. Replacing the profile with identical bytes still revokes the pending approval. The reset audit awaits these rechecks while retaining its separate history authorization.

## Journal and concurrent writers

Before mutation, the coordinator persists an encrypted prepared journal. An atomic protected-store batch installs all selected records and the applied journal together, including the exact installed revision of each record. Protected-store replacement files are flushed before rename. Every protected-store writer obtains the same exclusive writer lock, including separate store instances and processes using this implementation. Competing writes fail visibly rather than guessing that another writer has stopped.

After application, the coordinator uses the existing password-authorized encrypted access-history append, then clears the journal before reporting commit. It never deletes vault contents, profile credentials, authenticator entries, shared-mode state, personal vocabulary, custom images or unrelated history. Preference projection must subsequently adopt the returned native snapshot without turning browser storage into a second authority.

If application or audit fails, compensation restores each record only when its current revision still belongs to that reset. A newer concurrent value survives. Conflict details remain in the encrypted journal and block another reset pending explicit local review. Recovery does not silently claim an audit succeeded. Recovery of a surviving prepared journal aborts that unperformed intent; recovery of an applied journal conditionally restores its owned revisions.

Each compensation write and its new restored revision are saved atomically in the same journal update. After interruption, recovery skips an already restored record only while that exact restored revision remains current, then continues the remaining records. A later same-value write is a conflict rather than proof of ownership. Final journal removal is conditioned on all restored revisions so a concurrent writer cannot be missed between inspection and cleanup. The profile-conditioned completion write is the transaction's completion point; a later profile change does not retroactively change a completed transaction.

## Remaining recovery and delivery work

A process interruption can leave `protected-records.json.lock`. This implementation does not delete that lock based on guessed process death. A future owned-process recovery mechanism must prove no active writer exists before removing an abandoned lock. While the lock remains, recovery is unavailable and reports the exact abandoned-lock boundary. Hardware power-loss durability and installed runtime recovery have not been verified.

Native preference adoption, all desktop writer coordination, exact renderer preview/confirmation wiring, projection refresh, user-directed conflict resolution, and an authenticated history reconciliation after interrupted audit remain incomplete. These are acceptance gaps, not implied guarantees from the coordinator's tests.

## Verification

Focused Node tests use isolated synthetic temporary directories and an AES-GCM test encryption adapter. They exercise one-use approval, actor changes, expiry, cancellation, revision ABA, atomic batch conflict, encrypted journal storage, owned-only restoration, restart recovery without an abandoned lock, persistence failure, authorization loss, canonical format rejection and preservation of unrelated records. This proves the tested host transaction behavior only. It is not proof of operating-system protected storage, native installed interaction, confirmation accessibility or production restart recovery.
