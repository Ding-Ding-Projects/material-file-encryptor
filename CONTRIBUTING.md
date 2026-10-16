# Contributing to Material File Encryptor

Thank you for helping. This project is free, and it stays free: contributions must not add paid features, purchase or upgrade prompts, payment collection, license-key gating or trial timers. `node scripts/audit-monetization.mjs` checks this and `npm test` runs it.

## Before you change anything

1. Read the [README](README.md), [HANDOFF.md](HANDOFF.md), [ROADMAP.md](ROADMAP.md) and the feature documentation under [docs/features](docs/features/README.md) that covers the area you are touching. They record what is verified, what is only built and what is still open.
2. Fetch the latest `main` and start from it. Keep unrelated local work out of your change.
3. Use the real root entrypoints: `build.bat /s` builds the product and `build-installer.bat /s` produces the unsigned Squirrel.Windows installer. Do not replace them with helper commands.

## Checks

- `npm test` runs `node --test test/*.test.js`.
- `pwsh -NoProfile -File scripts/verify-local.ps1` runs the broader local checks.
- `node scripts/audit-material-motion.mjs` must report zero findings for any change to the desktop, the extension or the documentation website.
- Run the checks that match your change and say which ones you ran. Production workflows build and package; they do not run tests.

## Documentation

Every feature has its own Markdown file under a categorized folder in `docs/features`. Each English `.md` file has a Cantonese `.zh-HK.md` twin with identical inline code, and `docs/site/language-pairs.json` records the LF-normalized SHA-256 of each pair. Update both files and the recorded hashes together.

User-facing text appears in English, Cantonese and bilingual modes. Controls are Material Design 3 components with Material motion that respects reduced-motion settings.

## Pull requests

- Keep a change small and focused, and describe what it does, how you checked it and what remains unverified. Do not claim a check you did not run.
- Do not force-push shared branches, and do not delete work that is uncommitted, unmerged or unpushed.
- Screenshots in the README and documentation must be genuine captures of a real build, with their provenance recorded. Never add a mock, an edited image or a design preview as evidence.
- Keep credentials, machine paths and private data out of commits, issues and captures.

## Conduct and security

Be kind and specific. See the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities as described in the [security policy](SECURITY.md), not in a public issue.
