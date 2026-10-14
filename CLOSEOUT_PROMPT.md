````text
Material File Encryptor: continuation handoff (state as of the Material layout polish on main)

Objective: every element of the desktop application uses Material Design 3 components with Material transitions and motion, and every required feature is implemented and verified.

Landed on main:
- Material conversion sweep, Material dialogs in main-owned windows with nonce-bound answers, shared motion tokens, shutdown prompt that names unfinished work, README desktop captures with provenance, unified bilingual separator.
- Layout polish from hidden-desktop capture review: local access legend inside its card (862444b), data table headers reach the right outline (4a30e82), workflow document fields span their column (a36600b), suite buttons keep their own width (9eb2ffa), guidance buttons sit beside the control they explain (3dd5a52, 07daa65).

Verification:
- Hidden-desktop captures of the built application across 19 views in English light, English dark, Cantonese and bilingual at 150 percent display scale; Material dialogs captured in light and dark and cancelled with no change; each layout fix captured after rebuild.
- Focused suites for each change pass; release workflow runs for 862444b, 4a30e82 and a36600b succeeded.
- A full dark-theme sweep after the guidance change and a generic-control scan of all 19 views reports only data tables, styled disclosures, semantic fieldsets and the hidden native internals of the Material date and file picker composites.

Not yet done:
- Captures at 100, 125 and 200 percent display scale require the owner to change the host display scale.
- Individual captures of the licence, pairing, credential, import and update message boxes.
- Branch codex/feature-mediation-01a137ae (protected settings reset): native writer adoption and independent review outstanding.
- Renderer browser tests cannot run on this host because package file redirection makes evidence paths non-canonical.

Next safe steps: read back the release runs for 9eb2ffa onward, then capture the remaining message boxes individually.
````
