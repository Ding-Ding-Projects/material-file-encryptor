# Access workspace design reference

This target-owned state inventory specifies the real access implementation. It is a design reference, not a screenshot or runtime result. The shared shell design reference supplies the surrounding navigation and Material Web components.

## Structure

A compact page heading and convenience-lock disclosure precede four Material primary tabs: Local profile, Element locks, Authenticator, and Support Tickets. The active workflow owns one panel. Credentials remain in their originating fields across language refresh; changing the workflow closes waiting challenges and hides camera/QR output. Authenticator registration expands only through Add or Edit, leaving the account list as its normal workspace.

The profile panel groups its password, status, primary setup/unlock actions and logout. The lock list has local search and an explicit empty creation route through each element's context menu. The non-modal wizard carries a read-only exact target and its own policy, factors, session mode and disclosure. A bounded painted floating surface carries unlock and lock setup, with focus returned on cancellation.

## Components and spacing

Use actual Material Web filled/text buttons, outlined fields/selects, checkbox, switches, slider, tabs, and the registered file-picker composition. Do not substitute styled native controls. Use surface-container-low panel backgrounds, outline-variant boundaries, 20px rounded groups, 12px internal gaps, 44px minimum action targets and fluid field widths. Floating prompts use surface-container-high, a visible outline and elevation, bounded scrolling, and 24px corners. All state must remain readable at the exact tuples in state-inventory.json.

## Interaction acceptance

The state inventory is hand-written and names each profile, lock, waiting, authenticator, QR, support and confirmation state. Collection workbenches own isolated queries and receive labels only, never credential values. Each dropdown obtains the shared adjacent searchable menu with its own anchored full regex workbench.

Test all three language modes, both themes and four scales at both supported viewport sizes. Physical display scaling remains separate from browser zoom evidence. Exercise keyboard focus, Escape, cancel/retry, live translation, one-activation expiry and nested Shadow DOM admission. Use isolated synthetic credentials, clear them before evidence retention, and omit all QR, secret and generated-code pixels from publishable captures.

## Verification boundary

Focused Node tests establish logic and primitive construction, including deliberate red/green picker and cancellation regressions. They do not establish real layout, assistive technology, physical camera operation, native vault integration, installer behavior or physical display scaling. The integrated built acceptance lane owns those receipts.
