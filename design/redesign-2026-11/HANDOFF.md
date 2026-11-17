# November 2026 redesign: design handoff

This folder is the checked-in copy of the November 2026 design canvas for the desktop app and the
documentation site. The canvas is the reference for the implementation work on the
`ai/*/20261116-*` branches. A board here is a design, not shipped behaviour: nothing in this folder
claims that a screen is implemented or verified.

## Layout

- `project/canvas.json`: the canvas index. One category per page, every board has its own sticky
  note beside it, titles and notes in ordinary English.
- `project/*.dc.html`: one file per board, the whole board source.
- `frames/*.png`: real renders of every board at 150 ms, 600 ms and settled, filmed in headless
  Microsoft Edge from the files in `project/` with the canvas runtime.
- `REHEARSAL.md`: the review that was run on those frames and what changed because of it.

## Direction

The first pass looked too much like a marketing page (large hero titles, stat cards with calls to
action, a full-bleed dark unlock stage). It was redrawn as a dense working tool: drive tabs in the
title bar, a command bar, a folder tree, a sortable file table, an inspector with the encrypted part
map, versions and backup status, a transfers strip and a status bar. The documentation site keeps
its own editorial look so the two never resemble each other.

## Pages and boards

| Page | Board | What it shows | Tweaks |
| --- | --- | --- | --- |
| App workspace | `Main.dc.html` | Dense drive workspace; click tabs and rows | accent, motion, density |
| App workspace | `Unlock.dc.html` | Unlock inside the locked drive's tab, with ring, burst, shackle lift, hand-off and failure shake | accent, motion, stage |
| Docker Hub and sign-in | `Backup.dc.html` | One-click public backup of current drives as a side sheet | accent, motion, stage (ready, signing in, uploading, done, failure) |
| Docker Hub and sign-in | `SplitStorage.dc.html` | Split storage with locations, shares, copies, rules, plan preview, job phases, Safety backup (confirm to turn off, held state) and Mirrors | accent, motion, stage (setup, running, held, done), sameDisk, mirrorStale |
| Docker Hub and sign-in | `NewDockerHubDrive.dc.html` | Create a drive without choosing any folder: On this computer or Docker Hub, guided code sign-in, the rich repository picker (search with regex, filters, visibility, last pushed, size, drives found, detected drive cards, per-row errors), name, letter and password, the public warning, creation progress and Show folder | accent, motion, stage (choose, signin, repository, scanning, repoError, details, creating, done, failed) |
| Docker Hub and sign-in | `OpenFromDockerHub.dc.html` | Open a drive from Docker Hub: the same repository picker with drive cards as the main choice, latest snapshot preselected, restore into an automatic folder with an Advanced: choose folder option, unlock and mounted | accent, motion, stage (repository, scanning, repoError, snapshots, location, restoring, unlock, mounted) |
| Docker Hub and sign-in | `SignIn.dc.html` | Every guided sign-in state with one next step, and the seven sign-in fixes | accent, motion |
| Motion and installation | `Motion.dc.html` | Animation and transition editor: master switch, speed, profiles, 15 element kinds, per-kind controls, easing, JSON import and export | accent, motion |
| Motion and installation | `Install.dc.html` | Full-window installation success and failure takeovers with real facts | accent, motion, stage |
| Settings, tools and required features | `Settings.dc.html` | Settings groups, search with the adjacent regex strip, comfort, sound, contrast, text size, and a feature coverage readout | accent, motion, regexOpen |
| Settings, tools and required features | `Tools.dc.html` | New tab catalog and the full regex builder modes | accent, motion |
| Narrow window | `Mobile.dc.html` | 390 px layout with drawer, overflow chips, file cards and a details bottom sheet | accent, motion, sheet |
| Documentation site | `Site.dc.html` | Task-led home with unmasking headline, drawn diagram, task grid and a part size explorer labelled as an example | accent, motion |

The same two shared levers, `accent` (default `#4B57C9`) and `motion` (default on), appear on every
board with the same names and defaults.

## Cloud backup facts the design depends on

- Only the drive's on-disk objects are uploaded: `vault.json` and the `parts/`, `commits/` and
  `activity/` `.mfe` files, each as one OCI layer with a verified digest. Nothing is decrypted.
- Public visibility is the default for the one-click flow. `vault.json` holds the key derivation
  settings, salt, wrapped key and key check, so a public copy allows offline password guessing.
  The design states this and recommends a key file or a long passphrase.
- Automatic sync is turned on at every 60 minutes with a 15 minute retry; the schedule code already
  supports 5 minutes to 7 days or calendar times.

## Intentional choices

- The middle of the locked drive's pane is empty apart from the unlock card: a locked drive shows
  nothing readable.
- The sign-in board is a state reference sheet, so it uses a card grid rather than app chrome.

## Process notes

- Stageshow guidance was installed fresh for this pass (the installed copy matched the maintained
  cache except for line endings). References read: `SKILL.md`, `references/review.md`,
  `references/craft.md`. No gold example was copied, because these are real app screens rather
  than marketing illustrations; Stageshow rules for marketing framing, plates and cursor demos
  were recorded as not applicable. Restraint, hierarchy, density, motion causes and the review
  method were applied.
- The canvas runtime was rendered locally over a loopback server; Playwright's bundled browser was
  not installed, so the installed Microsoft Edge was used through Playwright's `msedge` channel.
