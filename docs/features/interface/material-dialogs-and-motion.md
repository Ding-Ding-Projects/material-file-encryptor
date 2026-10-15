# Material dialogs, controls and motion

Every message box, control and screen transition in the desktop application uses Material Design 3 components and motion. This article describes what changed, how prompts stay trustworthy, and what has and has not been verified.

## Message boxes

Confirmation, consent and error prompts from the application process render as Material dialogs instead of operating-system message boxes. This covers browser pairing, local model connection changes, server licence review, scheduled credential storage, file import confirmation, shutdown choices and update prompts. File and folder pickers remain native.

### Trust boundary

- Each prompt opens in its own modal window owned by the application process, with an isolated preload, sandboxing and a strict content security policy.
- The main application window cannot answer a prompt. A choice is accepted only from that dialog window, only with the one-time value issued for that prompt, and only for a button that exists.
- Closing the window or pressing Escape chooses the cancel button. Enter activates the focused button, and focus starts on the default button.
- If the dialog window cannot be created, the operating-system message box is shown instead, so a consent prompt is never skipped.

### Appearance

The dialog has no operating-system frame. Its title appears as a small label at the top, which also moves the window. A leading icon reflects the prompt type: information, question, warning or error.

## Controls

- Section switchers in the converter, local models and file details use Material tabs with an active indicator.
- Clear actions sit inside their text fields as trailing icon buttons.
- Selects carry their own labels and supporting text. Outlined selects keep enough width for their labels.
- Progress uses Material linear progress.
- Disclosures read as expansion panels with a turning chevron.
- Update states are explained in words in English and Cantonese. A reason the application does not recognise is still shown as received.
- The documentation index reads as a navigation drawer with the open article highlighted.
- Unavailable server targets are shown as a disabled list.

## Motion

Shared Material easing and duration tokens drive screen and tab panel entrances (fade through), card and table row entrances (fade up with a short stagger) and disclosure expansion. The reduced-motion system setting turns all of it off.

### Motion contract

The browser extension pages, the desktop renderer, the documentation site (its source pages, generated page templates and staged output) and the profile verification page share one contract. Every interactive element uses a Material Web component or a documented state layer that changes on hover, focus and press through a transition. Dialogs, side sheets, tab panels, disclosures and status messages animate in with the shared tokens `--md-sys-motion-easing-standard`, `--md-sys-motion-easing-emphasized-decelerate` and `--md-sys-motion-duration-short4`, never a literal easing curve. Every transition and animation has a `prefers-reduced-motion` override. `scripts/audit-material-motion.mjs` checks the contract statically and `test/material-motion-audit.test.js` requires zero findings. The only native controls allowed are the hidden file inputs, the home destination cards and the documentation site's no-script baseline markup, each listed with its reason in the script. The documentation site entries are accepted only while `scripts/audit-material-motion.mjs` can confirm that `preparePublicDocumentControls` upgrades every native control to the registered Material controls before any listener is bound. Controls created by script use Material Web components directly. `node scripts/audit-material-motion.mjs --site out/site` audits a staged site, and the test stages one and requires zero findings there too.

### Runtime audit

`scripts/audit-runtime-motion.mjs` proves the same contract on what actually renders. It drives a disposable headless Edge or Chrome profile over the DevTools protocol, loads the staged browser extension, the staged documentation site and the desktop renderer (served from source with the preload bridge stubbed), and runs the page-side audit in `scripts/runtime-motion-page.mjs` in every state:

- Every visible interactive element, including those inside open shadow roots, is classified as a Material Web control, a documented allowlisted native element or a finding. Parts that live inside a Material component's own shadow root count as that component.
- Each interactive element must show a transition, an animation, a ripple or a state layer. Hyperlinks and disclosure summaries need a transition too.
- Dialogs, menus, side sheets and tab panels that open must run an enter animation, observed through running Web Animations, CSS animations and transitions.
- With `prefers-reduced-motion: reduce` emulated, or the in-app Motion or attention setting on, no visible element may keep a transition or animation, and that includes elements inside Material Web shadow roots. A page stylesheet cannot reach those roots, so `src/shared/surface/reduced-motion.js` adopts one small stylesheet into the shadow root of every `md-*` element while reduced motion is requested (the media query, `data-motion="reduced"` or `data-low-stimulation="true"` on the document element), removes it when reduced motion is turned off, covers elements added later, and finishes the finite Web Animations that Material Web starts from script, such as the press ripple. The extension, the documentation site and the desktop renderer all install it. Leaks inside shadow roots are counted as findings, listed with their `md-*` host.

The runtime allowlist is shorter than the static one: hidden file inputs, the platform picker inputs inside `mfe-date-field` and `mfe-file-picker`, and the home destination cards, each with its reason in the script. The documentation site needs no entry because its baseline markup is upgraded before the audit reads it. Stage with `node scripts/build-browser-extension.mjs` and `node scripts/build-site.mjs`, then run `node scripts/audit-runtime-motion.mjs --surface all --out receipt.json`. The committed receipt `docs/evidence/runtime-motion-<shortsha>.json` records element counts, findings, enter probes and reduced-motion results per surface. The renderer run is source-fixture evidence and does not cover the installed application. `test/runtime-motion-audit.test.js` runs the page-side classifier over static fixtures and requires a native button with no transition to be flagged and a Material control to pass. It also requires a leak inside a shadow-root fixture to be flagged, and requires the shared helper to apply and remove its stylesheet correctly.

Coverage: the extension and the desktop renderer are audited in English (`en`), Cantonese (`yue`) and bilingual (`bilingual`) modes, each reported as its own surface such as `extension/yue`. The site audit covers every category page and every article page at 1280 and 360 pixels wide in light, a sample of both in dark, and the inner states of the wiki and workspace pages: every tab, each wiki article, disclosures, wiki search, and the first, middle and last workspace document. `node scripts/audit-runtime-motion.mjs --surface all --without-shadow-reduction` is a negative control that must report shadow-root leaks. One surface per process may be run in parallel and the receipts joined with `--merge a.json,b.json --out merged.json`.

## Shutdown

Read-only requests, such as catalogue, status and font list reads, no longer keep the application open at exit. Mutating, transferring and user-gated work still blocks exit and still offers the shutdown choices.

## Language

Dialog text follows the interface language. In Cantonese mode the title, message, explanation and buttons are shown in Cantonese; in bilingual mode each line shows English and Cantonese together. Labelled detail lines translate only their label, so file names, addresses and other values stay exactly as written. Text without a reviewed translation stays in English rather than being guessed.

## Verification

- Focused tests cover the dialog trust boundary, including a check that fails if the one-time value is not enforced, plus update reason wording and the shutdown pending rules.
- Hidden-desktop captures of the built application show the converted screens and a real consent prompt rendered as a Material dialog, cancelled by Escape with no change applied.
- Hidden-desktop captures show dialogs in light and dark themes, following the in-app theme setting, and a credential prompt in English, Cantonese and bilingual modes, each cancelled with no change.
- Display scales other than 150 percent and the remaining individual prompts have not yet been captured.
