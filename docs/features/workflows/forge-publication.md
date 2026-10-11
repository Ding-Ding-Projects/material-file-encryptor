# Account and repository publication

The installed desktop uses the GitHub CLI for browser sign-in, account discovery, active-account selection and per-account sign-out. Credentials remain in the operating-system credential store managed by `gh`. The service rejects plaintext credential configuration, strips bearer environment overrides, returns only account names and active state, and never asks the renderer for a credential. Selected-account refresh currently fails before any command because the CLI refresh transaction uses mutable active-account state; browser sign-in is the available account renewal path.

Publication preparation starts with a project folder selected through the native picker. Select an authenticated active account, an available personal or organization owner, a repository name, visibility and either copy-and-push or fork. Preparation freezes a clean committed source revision. A future copy-and-push operation would upload the complete committed history of that revision; a future fork would preserve upstream visibility without uploading local changes.

## Publication is currently unavailable

The supported CLI route cannot durably bind all repository API calls and Git credential-helper lookups to the reviewed account. `gh` can fall back from a missing account-specific keyring credential to its shared active credential. An isolated metadata configuration and repeated identity checks do not eliminate that race. The service therefore returns `publicationAvailable: false` with an exact reason and rejects `publishPublication` before running any command. It creates no repository, fork or upload. The source is never reset, rebased, switched or force-pushed. Actual publication remains incomplete until a supported account-bound transport is available without credential extraction.

This boundary is based on the [GitHub CLI 2.102.0 authentication implementation](https://github.com/cli/cli/blob/v2.102.0/internal/config/config.go#L238) and [its Git credential helper](https://github.com/cli/cli/blob/v2.102.0/pkg/cmd/auth/gitcredential/helper.go#L108). Future production support must cover account changes and credential removal during an operation, cancellation between awaits, partial creation, conflicts, exact destination readback and uploaded revision proof.

All serialized account operations retain a cancellation generation across command and filesystem gaps. Cancellation prevents any later command and prevents an already cancelled result from reporting success. A command that has already begun may have changed account state; cancellation cannot promise rollback of external state.

The account mutation and publication actions are desktop-only. Browser adapters must not expose them. All command arguments are separate arrays without a shell; destination identifiers are bounded and validated. Authentication may require the user to finish the CLI browser flow. Browser authentication, credential-manager persistence and actual provider mutation have not been exercised by the injected local tests.

## Verification

`test/forge-workflow.test.js` uses synthetic command responses and disposable folders. It verifies active account admission, owner permissions, bearer-environment removal, exact confirmation, committed-source admission, device authorization presentation, cancellation during a credential-check gap, cancellation after account mutation and publication refusal before any external command. These tests do not publish a repository or use an existing user's account.
