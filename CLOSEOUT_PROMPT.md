````text
Material File Encryptor: continuation handoff (state as of the Material conversion integration on main)

Objective: every element of the desktop application uses Material Design 3 components with Material transitions and motion, and every required feature is implemented and verified.

Landed on main (this pre-dew):
- Fresh-host build fix: the bootstrap places one Microsoft-signed vcruntime140.dll beside the pinned Node runtime when the system Visual C++ runtime is absent (build.bat /s exit 0 on a fresh host).
- Material conversion sweep (branch codex/lang-gui-sweep-20261014, merged): Material tabs, in-field clear buttons, labelled selects, linear progress, expansion panels, chevron icon buttons, a navigation-style documentation index, a disabled list for unavailable server targets, worded update reasons, a Material warning card.
- Message boxes render as Material dialogs in main-owned frameless windows. Only the dialog window with its one-time nonce and a valid button index can answer; closing or Escape cancels; the native message box is the fallback. Dialogs follow the in-app theme.
- Shared Material easing and duration tokens with entrance motion for views, tab panels, cards, table rows and disclosures; reduced-motion settings disable it.
- Read-only feature requests no longer hold the application open at exit; mutating and user-gated work still does.
- Bilingual article docs/features/interface/material-dialogs-and-motion(.zh-HK).md, registered in the inventory, language pairs, catalogue, route contracts and surface registry.

Verification:
- Hidden-desktop captures of the built application (English light, English dark, Cantonese) across 19 views, with clean owned teardown; a real consent prompt captured as a Material dialog and cancelled with no change.
- Full suite on the branch: 1766 passed, 11 failed, every failure also present on main (host package-path redirection and timing-sensitive checks). Focused suite on merged main: 88 passed.

Not yet done:
- Captures at 125 to 200 percent display scale and in bilingual mode; dark-theme capture of a Material dialog; individual captures of the licence, pairing, credential, shutdown, import and update prompts.
- Refresh README, documentation site, wiki and gallery screenshots from the rebuilt application.
- Branch codex/feature-mediation-01a137ae (protected settings reset) remains separate: the writer-lock finalization fix is pushed, but native writer adoption and the independent review are outstanding; the renderer entry point stays disabled.
- Renderer browser tests cannot run on this host because package file redirection makes evidence paths non-canonical.

Next safe steps: dew main, read back the release workflow run for this commit, then capture the remaining scale, bilingual and per-dialog states and refresh the public screenshots.
````
