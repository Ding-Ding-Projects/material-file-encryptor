# Browser protection observations

The extension options Connection panel can refresh a typed, read-only native protection snapshot. Browser connection, transfer outcome, native profile verification and shared mode remain separate observations. Download pairing authorizes this observation route only; it never grants browser profile permission or enables personal wording.

## Transport and authority

The paired native request has exactly `type` and `session`, with `type` equal to `protection-status`. The broker requires the reviewed extension origin, current in-memory pairing session, unlocked desktop and available admission. It checks the session and admission again after the trusted read. Unknown fields, expiry, revocation, lock and close are rejected.

The trusted main-process callback reads the existing native profile verification grant. It does not borrow a desktop IPC sender frame for a browser request or accept an actor in serialized input. The grant is bound to the actual current desktop frame, its cancellation epoch and protected credential revision. Expiry, revision changes, logout, detached/replaced frames and close prevent a current authenticated result. An unreadable profile record reports unknown.

The shared record is read before and after the profile read. Active mode reports active; malformed, unreadable or changing mode reports unknown. An absent record uses the existing inactive default. This is a refreshed observation, not a live subscription, and contains no shared credential. It is not a transaction across external file writers and cannot be used as an authorization decision.

The response has exactly `type`, `schemaVersion`, `profile`, `sharedMode` and `browserPermission`. Version is 1. Profile is authenticated, locked, expired or unknown. Shared mode is active, inactive or unknown. Browser permission is always unavailable. No credential, verifier, cache key, private mapping, source filename or filesystem path is serialized.

## Extension behavior

Only exact top-level popup and options extension pages can request the worker route. The worker validates every native response and preserves observations only for the same connection epoch and session. It ignores messages and disconnect events from stale ports. Pairing sessions and protection observations remain in memory, without browser sync, settings export or history.

The options panel localizes observations in English, Cantonese and bilingual modes. A failed or malformed protection read clears those observations while retaining separately received connection state. Refresh is deliberate. Personal wording and shared-mode mutation remain unavailable; this slice provides neither a browser grant nor a parallel authentication mechanism. The existing local-only CSP and permissions remain unchanged.

## Verification boundary

Dedicated access, broker, extension-worker and options tests exercise native grant expiry/revision/cancellation, close and frame changes during reads, shared-mode races, exact request and response shape, forged sender paths, stale ports and localized unavailable state. Existing native-host and actual-frame IPC tests remain separate checks. Signing, installed identity, registration, genuine browser/native interaction, runtime revocation, visual parity and display scaling require independent runtime evidence. Synthetic checks do not establish those outcomes.
