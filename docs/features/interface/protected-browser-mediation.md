# Protected browser mediation foundation

The native browser broker separates download pairing, protection observations, and protected authorization. Pairing and an `authenticated` protection observation never authorize a protected operation.

## Current availability

The installed lifecycle does not wire native authentication callbacks. Its paired capability discovery returns `authentication: unavailable` and an empty operation list. The extension forwards only read-only discovery from its exact top-level popup or options sender. Authentication and execution are not exposed by the extension or public documentation workspace. Existing download proposal, confirmation and status behavior remains unchanged.

This is a tested service boundary, not completed browser authentication. The existing loopback companion adapter is a separate transport and does not acquire authority from this module.

## Protocol and native callback contract

Messages remain limited to 64 KiB. Exact schemas reject unknown fields, symbols, inherited object properties, unsupported operations, other profiles and targets. Native framing continues to reject duplicate and reserved JSON keys. The reviewed extension origin and its current paired session are required for every request.

The native-only callbacks are `authenticateProfile`, `validateAuthority`, and `readProfileSummary`. Discovery advertises the single `read-profile-summary` operation for `local-profile` and `profile-summary` only when all three callbacks are actually installed. A caller-supplied status or boolean cannot advertise support.

`authenticateProfile({origin, profileId, operation, target, signal})` must perform fresh explicit profile authentication and native consent. It returns exactly `{profileId, revision, expiresAt, authority}`. The authority is an opaque object retained in the native process. No password, private vocabulary JSON, profile revision, actor identity or credential-derived metadata is returned to the browser.

`validateAuthority({authority, profileId, revision, signal})` must revalidate the live native actor, credential revision and cancellation generation. It returns exactly `true` only while this authority is current. It must not use the read-only protection snapshot as authentication evidence. `readProfileSummary` receives the same context and may return only `{schemaVersion: 1, profile: authenticated, protectedAccess: granted}`. The adapter checks the authority again before returning that fixed summary.

Native callback implementations must honor their abort signal. Consent waits time out after 30 seconds. Cancellation rejects promptly even if a callback fails to settle; a late callback cannot create a grant or return a protected result.

## Grants and revocation

An explicit approved authentication creates a random, in-memory grant bound to the exact origin, paired identity, profile revision, operation and target. It expires after at most 60 seconds and no later than the native authentication or paired session expiry. A new grant replaces the previous grant. Grants are consumed synchronously before asynchronous execution validation. An exception, replay or attempted concurrent use never restores a consumed grant.

Revocation clears grants and aborts pending authentication or execution. Desktop lock, session replacement, expired authority, credential revision change, broker close and adapter close reject stale responses. Scope errors cannot dispatch arbitrary features, shell commands, files or actions.

## Outstanding integration and acceptance

- A separately reviewed native GUI callback must supply fresh profile authentication, consent and opaque actor binding. It is unavailable by default.
- The native pipe relay generates connection identifiers after same-user pipe admission, attaches them to broker envelopes, and emits exact disconnect notifications. An EOF monitor detects connection loss while consent is pending and rejects pipelined messages. Replacement pairing cancels old consent; old connection teardown cannot revoke the replacement. Synthetic transport tests cover these boundaries. At source 1f0c5b67016745c301d75c4acf2d9b9fd7e575e5, the root browser-host-only build and five compiled transport checks passed. They exercised pending-consent disconnect, replacement pairing and delayed prior replies with owned synthetic clients. This does not establish actual browser-extension port behavior.
- Extension authentication and operation controls, public workspace mediation, and native callback composition are not wired by this foundation.
- Synthetic focused tests cover forged sender/session, pairing-only use, wrong scope, expiry, replay, revision changes, revocation, cancellation, invalid schemas, oversized messages and late results. They do not prove live browser pairing, production profile consent, layout or installation. The separate compiled transport result above is limited to its synthetic native clients.

See the [Cantonese article](protected-browser-mediation.zh-HK.md).
