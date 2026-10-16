---
name: mfe-motion-audit
description: Run the static and runtime Material motion audits over the extension, the documentation site and the renderer. Use after changing styles, transitions, dialogs or any script-driven animation.
---

# Material motion audits

## When to use

After any change to stylesheets, transitions, animations, dialogs, panels or reduced-motion handling, and before accepting a user interface change.

## Prerequisites

- Node 24 or later.
- For the runtime audit: a Chromium-based browser (Edge or Chrome, or `--browser <path>`), the staged extension (`out/browser-extension`, see `mfe-extension-evidence`) and the staged site (`out/site`, see `mfe-site-and-screenshots`).

## Procedure

1. Static audit of sources: `node scripts/audit-material-motion.mjs` (add `--json` for machine output). Include generated pages with `node scripts/audit-material-motion.mjs --site out/site`.
2. Runtime audit of one or all surfaces: `node scripts/audit-runtime-motion.mjs --surface all --extension out/browser-extension --site out/site --out out/runtime-motion.json`. Valid `--surface` values are `extension`, `site`, `renderer` and `all`. `--quick` samples fewer states and is only for iteration.
3. To combine receipts produced on separate runs: `node scripts/audit-runtime-motion.mjs --merge a.json,b.json --out merged.json`.
4. Negative control: run step 2 with `--without-shadow-reduction`. It empties the shared stylesheet, so the run must report reduced-motion leaks. A control that stays clean means the audit is not seeing what it claims to see.

## Expected output

- Static audit: one line per finding (`rule`, file, detail) and a summary `scanned <n> files; <m> finding(s)`. Exit code 0 only with zero findings.
- Runtime audit: one line per surface with state count, interactive elements checked, findings, enter animations and reduced-motion leaks. Exit code 0 means clean, 1 means findings, 2 means a surface errored and was not audited.
- The receipt carries `sourceCommit`, whether the run was quick, and whether shadow reduction was enabled.

## Failure handling

- Fix the stylesheet or script so it uses the shared motion tokens and honours reduced motion; do not add the finding to an exception list to turn the run green.
- Exit code 2 is not a pass. Rerun once the missing staged surface or browser is available.
- A quick or negative-control receipt must never be presented as the full audit.

## Owner steps

None. Both audits are local and read only.

## Availability

Both scripts exist. The runtime audit covers the surfaces it can launch headless; the installed desktop window is exercised separately through the installed verification skill.
