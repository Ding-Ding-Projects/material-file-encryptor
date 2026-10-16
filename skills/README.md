# Operational skills for Material File Encryptor

These skills record the build, packaging, verification, evidence and release procedures that work in this repository, so a later maintainer or coding agent can repeat them without rediscovering them. Each skill is a folder holding a `SKILL.md` with YAML frontmatter (`name`, `description`) and the same fixed sections: When to use, Prerequisites, Procedure, Expected output, Failure handling, Owner steps and Availability.

| Skill | Covers |
| --- | --- |
| [`mfe-build-and-verify`](mfe-build-and-verify/SKILL.md) | `build.bat`, `build-installer.bat`, `scripts/verify-local.ps1`, the Node test suite |
| [`mfe-extension-evidence`](mfe-extension-evidence/SKILL.md) | staging the browser extension, capturing extension evidence, reference parity |
| [`mfe-motion-audit`](mfe-motion-audit/SKILL.md) | static and runtime Material motion audits |
| [`mfe-site-and-screenshots`](mfe-site-and-screenshots/SKILL.md) | building the documentation site, refreshing and applying screenshots |
| [`mfe-release-verification`](mfe-release-verification/SKILL.md) | release metadata, `RELEASES` row and provenance checks |
| [`mfe-installed-verification`](mfe-installed-verification/SKILL.md) | install, update, native host registration, uninstall and rollback on a real install |

## Rules shared by every skill

- Run every command from the repository root. Paths in these skills are relative to it.
- Use the root entrypoints `build.bat` and `build-installer.bat` for builds and installers. Do not substitute the helper commands they wrap.
- A command listed here is a recorded procedure, not a result. A receipt is evidence only for the exact source commit and build it names.
- Steps that need a person (licence acceptance, UAC consent, a restart, signing in to the code forge) are labelled **Owner step**. An agent must stop at them and report, not work around them.
- Never put local user names, machine names or absolute local paths in a receipt, a document or a commit message.
- `test/operational-skill.test.js` checks that these files keep their structure and that every path they name still exists.
