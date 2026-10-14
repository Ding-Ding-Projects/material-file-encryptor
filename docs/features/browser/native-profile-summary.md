# Native authorization for the browser profile summary

The native browser host has one protected scope: `local-profile`, `read-profile-summary`, `profile-summary`. This scope returns only the fixed authenticated/granted summary. It does not grant credential reads, shared-setting changes, School mode controls, authenticator access or arbitrary native operations.

## Local verification

When the complete native prompt adapter is installed, authentication opens a main-owned child window. The user enters the desktop local-profile credential and explicitly chooses to allow the summary. Drive unlock, download pairing and a renderer's profile observation are not authentication for this scope.

Only the exact child web contents, exact main-frame identity, expected local URL and prompt nonce may submit. The application renderer and browser cannot answer the prompt. Input is cleared before awaiting verification and on cancellation or closure. The preload exposes only the prompt view, submit, cancel and clear notification. Passwords, verifier records and authority objects are never returned through browser responses, exported, recorded in history or logged.

Verification uses a distinct internal native actor in the existing access service. It invokes the same profile verification and waiting-state coordinator as desktop authentication, so failed attempts and waiting periods are shared by profile target. It does not impersonate the application renderer or reuse its grants. This bounded prompt displays the shared waiting period; it does not introduce a waiting bypass or claim the full waiting-ladder interface is complete on the new surface.

## Authority and cancellation

Successful verification creates an opaque host-only authority bound to the protected profile's exact revision, a native revocation generation and an expiry of at most 60 seconds. Revision replacement, including a same-valued replacement, invalidates it. Validation rechecks the protected store across asynchronous boundaries. The existing browser mediation additionally binds a one-use grant to the paired connection and exact fixed scope.

Disconnect, explicit protected revocation, locking, quit/update preparation and native-helper loss revoke authority and cancel the prompt. A cancelled or destroyed child cannot produce a late authority. A successful prompt does not grant renderer history access. Discovery remains unavailable when the native prompt adapter is absent; this source wiring is not evidence of successful installed authentication.

## Verification status

The source includes focused tests for distinct actors, shared waiting, revision changes, expiry, revocation, abort during a protected read, exact child/nonce routing, safe IPC responses and delayed verification after cancellation. These tests are initially unrun while the primary build owns the host slot. Actual packaged modal behavior, keyboard/screen-reader acceptance, theme/language layout, waiting-ladder completeness and browser round-trip acceptance remain unverified.

Later genuine captures must cover the empty configured prompt, missing-profile state, rejected verification with cleared input, shared waiting state, and cancellation/owner destruction. Capture English, Cantonese and bilingual modes, light/dark presentation, normal/minimum client areas and supported display scales. Never capture a real credential or authority. Capture dates and source/binary bindings must come from actual receipts.
