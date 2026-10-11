# Personalization design reference

The reference below is a deterministic design document, not a runtime capture. The implementation uses Material Web components and the shared date/time/file compositions. The parent integration owns the actual built-surface capture and layout measurements.

## Structure

- Personalization retains five named tabs. Each tab contains task sections, compact fields, adjacent guidance, and localized validation.
- Appearance opens next to the selected element. State tabs and layer selection stay at the top. Eleven expandable authoring sections group image work, selection, effects, typography, geometry, and history.
- Common layer actions start expanded. Advanced sections start collapsed and retain their open state during the editor session.
- Motion choices with a finite domain use outlined selects. Renderer property and easing suggestions remain editable and open in the shared anchored menu.
- Date, time, and file controls are registered compositions with actual platform pickers behind Material fields and buttons.

## Interaction invariants

The shared document overlay captures a stable target. Edit and lock callbacks recheck access and retain that target through menu opening and focus changes. The appearance editor owns no competing contextmenu listener. Closing returns focus to the original target.

Each setting persists through its existing store. Appearance mutations retain validation, compare snapshots, undo/redo, protected image normalization, revision journaling, and failed-save rollback. A control migration does not add authority or assert native integration that the host has not supplied.

See [inventory.json](inventory.json) for the finite state matrix. The design reference is [reference.html](reference.html).
