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

## Shutdown

Read-only requests, such as catalogue, status and font list reads, no longer keep the application open at exit. Mutating, transferring and user-gated work still blocks exit and still offers the shutdown choices.

## Verification

- Focused tests cover the dialog trust boundary, including a check that fails if the one-time value is not enforced, plus update reason wording and the shutdown pending rules.
- Hidden-desktop captures of the built application show the converted screens and a real consent prompt rendered as a Material dialog, cancelled by Escape with no change applied.
- Dark theme, Cantonese and bilingual layouts, display scaling and every individual prompt have not yet been captured. Dialogs follow the system colour scheme rather than the in-app theme setting.
