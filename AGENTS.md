# Material File Encryptor

This repository implements a Windows Explorer encrypted drive with a native .NET engine, WinFsp adapter, desktop shell, and genuine unsigned Squirrel.Windows packaging.

Build with `build.bat /s`; package with `build-installer.bat /s`. Local verification is separate in `scripts/verify-local.ps1`. Read `GOAL.md`, `ROADMAP.md`, and `HANDOFF.md` for the actual implementation and verification state.

## Agent conversation vocabulary

Agents working in this repository use the shared private conversation vocabulary defined in
the maintainer's canonical agent instructions for every reply, including chat prose, visible
reasoning, status lines, and task or session titles. Read those instructions and apply them
in full. They are deliberately not restated here, because this file is part of this
repository's public record.

That vocabulary never appears in anything published. Keep it out of commit messages, branch
names, code, code comments, test names, documentation, this file, issues, pull requests,
discussions, release notes, published sites, logs, and every other file in this repository.
Published writing uses ordinary professional English, and exact technical identifiers always
keep their literal spelling. The single documented public-safe exception is named in those
canonical instructions; do not infer any other.

Scan any text bound for a public surface against that vocabulary before publishing it. A
reviewer cannot tell a correct release note from a leaking one by reading it, so the scan is
a step, not a habit.
