# Account and repository publication

The installed desktop uses the GitHub CLI for browser sign-in, account discovery, active-account selection and per-account sign-out. Credentials remain in the operating-system credential store managed by `gh`. The service rejects plaintext credential configuration, strips bearer environment overrides, returns only account names and active state, and never asks the renderer for a credential. Selected-account refresh currently fails before any command because the CLI refresh transaction uses mutable active-account state; browser sign-in is the available account renewal path.

Publication preparation starts with a project folder selected through the native picker. Select an authenticated active account, an available personal or organization owner, a repository name, visibility and either copy-and-push or fork. Preparation freezes a clean committed source revision. A future copy-and-push operation would upload the complete committed history of that revision; a future fork would preserve upstream visibility without uploading local changes.

## Account-bound publication

The ordinary `gh` active-account route can fall back from a missing account-specific keyring credential to its shared active credential. An isolated metadata configuration and repeated identity checks do not eliminate that race. Publication instead uses the supported secure-only selected-account lookup from a dedicated privileged product subprocess. The credential remains in private operation memory and is passed only in the environment of owned provider commands and the fixed Git credential helper. It is never returned to the renderer, persisted, exported, placed in command arguments or sent to a diagnostic log. A missing selected credential fails before publication; another active account is never substituted.

This boundary is based on the [GitHub CLI 2.102.0 selected secure-store command](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/auth/token/token.go#L67), [its account-specific keyring lookup](https://github.com/cli/cli/blob/v2.102.0/internal/config/config.go#L305), and [its Git credential helper](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/auth/gitcredential/helper.go#L108). The service verifies the provider's current viewer under the bound credential before any mutation. External active-account changes cannot replace the captured identity.

## Security and recovery

The product uses only absolute bundled executables from a build-produced hash receipt. It verifies the pinned versions, exact relative paths, regular-file identity and SHA-256 before invocation. The Git helper quotes its verified path with POSIX shell quoting rather than relying on `PATH`. Both tools must be present and unchanged; missing or modified tools fail closed. Copy-and-push creates a temporary bare clone, uploads the exact reviewed revision to `main`, and requires destination-property readback plus exact revision proof. It never force-pushes, rewrites history or changes the source branch.

The coordinated receipt contract is schemaVersion 1, with exact gh/bin/gh.exe and git/cmd/git.exe paths, pinned versions and SHA-256 fields. The legacy schema key and unknown schema versions are rejected. The actual producer receipt from build-source commit 9b6024f2ad09063feae7ef545a9aae9523dc1d8d is retained as a test fixture; it proves format binding without claiming installed acceptance.

Cancellation persists across filesystem, credential and command awaits. A cancelled in-flight provider command may still have changed the destination. Results distinguish confirmed completed actions from attempted actions and require destination review whenever a mutation may have begun. Temporary snapshots are removed, while a created destination remains preserved for review. No automatic deletion claims to roll back publication.

Private capture buffers are cleared and child-environment references released at operation end. JavaScript string storage and operating-system process environments do not provide guaranteed physical erasure, and a sufficiently privileged process inspector may inspect a running child environment. This is an explicit transport limitation, not a claim of hardware-backed isolation. Development tests use synthetic capture adapters; no current user's credential was read or an authentication/publication command executed.

All serialized account operations retain a cancellation generation across command and filesystem gaps. Cancellation prevents any later command and prevents an already cancelled result from reporting success. A command that has already begun may have changed account state; cancellation cannot promise rollback of external state.

The account mutation and publication actions are desktop-only. Browser adapters must not expose them. All command arguments are separate arrays without a shell; destination identifiers are bounded and validated. Authentication may require the user to finish the CLI browser flow. Browser authentication, credential-manager persistence and actual provider mutation have not been exercised by the injected local tests.

## Verification

`test/forge-workflow.test.js` and `test/forge-transport.test.js` use synthetic command responses, fake credential subprocesses and disposable folders. They verify selected-account binding across external account switches, missing selected-keyring refusal, cancellation before mutation and during capture, partial mutation results, capture-error redaction, helper path quoting, bundle hashes, exact confirmation and revision proof. These tests do not publish a repository or use an existing user's account. Live account, protected-store, publication and installed package acceptance remain unverified until separately performed.
