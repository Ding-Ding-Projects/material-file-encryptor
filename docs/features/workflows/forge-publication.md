# Account and repository publication

The installed desktop uses the GitHub CLI for browser sign-in, account discovery, refresh, active-account selection and per-account sign-out. Credentials remain in the operating-system credential store managed by `gh`. The service rejects plaintext credential configuration, strips bearer environment overrides, returns only account names and active state, and never asks the renderer for a credential.

Publication starts with a project folder selected through the native picker. Select an authenticated active account, an available personal or organization owner, a repository name, visibility and either copy-and-push or fork. Preparation freezes a clean committed source revision. Copy-and-push uploads the complete committed history of that revision; review the history for private information before confirming the exact `owner/name` destination. Fork preserves upstream visibility and does not upload local changes.

Copy-and-push creates a new destination and uploads the selected revision to `main` from a temporary bare clone. Source-local hooks and credential helpers are not copied into the publication checkout, global Git configuration is disabled, and only the fixed `gh` credential helper is permitted for HTTPS upload. The source is never reset, rebased, switched or force-pushed. A conflict, authentication failure or partial publication remains an explicit failure. A created destination is preserved for review if upload fails; cancellation does not silently delete it. Successful copy-and-push requires destination-property readback and exact `main` revision proof.

The account mutation and publication actions are desktop-only. Browser adapters must not expose them. All command arguments are separate arrays without a shell; destination identifiers are bounded and validated. Authentication may require the user to finish the CLI browser flow. Browser authentication, credential-manager persistence and actual provider mutation have not been exercised by the injected local tests.

## Verification

`test/forge-workflow.test.js` uses synthetic command responses and disposable folders. It verifies active account admission, owner permissions, bearer-environment removal, exact confirmation, committed-source admission, no-force upload arguments, readback, and explicit partial failure. These tests do not publish a repository or use an existing user's account.
