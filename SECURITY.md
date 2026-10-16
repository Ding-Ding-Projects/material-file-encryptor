# Security policy

## Reporting a vulnerability

Please do not report a vulnerability in a public issue, discussion or pull request.

Use the repository's **Security** tab and choose **Report a vulnerability** to send a private report. If that option is not available to you, open a public issue that says only that you have a security concern and ask for a private channel. Leave out the exploit details, proof-of-concept files and any real vault, password or key material.

A useful report names the affected version or commit, the component (native engine, drive adapter, desktop shell, browser extension or documentation website), the steps to reproduce, and the impact you expect. Test only against your own installation and your own throwaway vaults.

## Supported versions

Only the latest published release and the current `main` branch receive security fixes. Earlier releases are not patched.

## What the project does and does not promise

- Vault content, namespace metadata, journals and history use authenticated encryption. The password or key file protects the vault key, and there is no password-recovery service.
- Copying a file out of the unlocked drive creates plaintext by design, and Windows or other applications may keep their own temporary copies.
- Automatic unlock does not protect data from an operating-system session that is already unlocked.
- Ciphertext sizes, object counts and activity timing are not hidden.
- Installers are unsigned Squirrel.Windows packages, so Windows shows an unknown-publisher warning. That warning is expected for this project's installers and is not evidence of tampering by itself.
- The browser extension only proposes downloads. Pairing is explicit and temporary, and it does not grant access to a browser profile.

The [README](README.md#security-and-recovery-boundaries) lists these boundaries in full. Verification status for each area is recorded in [HANDOFF.md](HANDOFF.md); a boundary listed as unverified there has not been proven to hold.

## Handling reports

Maintainers review private reports as time allows, confirm or dispute them, and agree a disclosure date with the reporter. Credit is given when the reporter wants it. No response time is promised.
