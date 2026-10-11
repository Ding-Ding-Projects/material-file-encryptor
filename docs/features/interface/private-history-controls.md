# Private history controls

The shared Private local history panel uses registered Material outlined buttons for actions, outlined text fields for text, password and retention values, and Material checkboxes for record selection. The same panel serves desktop and browser personalization through their existing history-manager adapters.

## Original operations and permissions

Setup, unlock, lock, restore, labels, comparison, export, retention and pruning continue through the original manager callbacks. Guided actions await the same callback promise as direct actions. Disabled, canceled, detached or disposed actions cannot admit a new callback. Successful setup or unlock clears the password field; a rejected operation retains the input for correction and does not report completion. No credential is added to exports or guidance.

Record selection preserves record IDs and the latest two selected entries. Comparison requires exactly two IDs. Pruning still requires the existing destructive confirmation and an unlocked live panel. This control conversion changes no encryption, credential store or history-manager permissions.

## Search, validation and remaining controls

Search retains the host search adapter and original input-driven queries. Text and date filters retain their original query semantics. Clear awaits the original input consumer, restores the prior value after rejection and returns focus. Late query results cannot repopulate records after a newer refresh, lock or disposal.

Date filters remain native browser date inputs, explicitly marked as an unsupported Material conversion. The search placeholder remains native where the host has not replaced it. Download anchors remain implementation capabilities. This unit does not convert appearance, logo or the public preferences dialog.

## Verification boundary

Focused mounted-consumer checks cover constructor inventory, original asynchronous callbacks, cancellation and lifetime admission, password clearing, selection identities, rejected query rollback and focus. The minimal DOM fixture does not establish vendor shadow-DOM behavior, keyboard accessibility, layout, rendered glyphs or complete Material Design 3 conformance. Production build, genuine captures and independent reviews remain required.
