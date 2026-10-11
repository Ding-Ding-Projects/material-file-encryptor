# Panel layout and actionable notifications

`mountSurfaceFoundation` exposes `registerPanel(id, element)`. Register each working panel after mounting its content. `registerViews` also registers panel layout automatically unless the view supplies `layout: false`.

Each registered panel has Move, Resize and Reset layout controls. Drag the first two controls, or focus either control and press an arrow key. The keyboard step is 10 pixels, or 40 with Shift. Numeric geometry is stored under `mfe.panel-layout.v1:<id>` and clamped to current viewport bounds when applied. Reset deletes that panel's saved geometry. Destroy removes the controls and restores the original inline geometry. The control text supports English, Cantonese and bilingual modes.

Notifications accept canonical `progress: {value, label}` values with the percentage bounded to 0 through 100 and up to four canonical `recovery: [{id, label}]` actions. Supply `onNotificationAction(actionId, canonicalRecord)` when mounting the foundation. The callback decides which supported host operation to run; no command execution is inferred from action text. Recovery controls remain disabled when no callback is supplied. `updateNotification(id, patch)` updates the same record as an operation advances.

The center exposes selection, select-visible, bulk read and bulk dismissal. JSON and CSV exports retain canonical fields, including progress and recovery metadata. Display translation does not rewrite those records. Notification sound requires enabling its visible switch in each session. Audio is bounded to a short local tone, and no audio file or network request is used.

Changing the foundation language preserves matching transient controls such as search text, regex flags, selection ranges and open dialogs across chrome reconstruction. Identical-language calls do not remount the chrome. This preservation uses structural control paths; a simultaneous change to a component's structure may prevent a field from matching, so it is not a durable form-draft store.

Focused executable tests cover pointer and keyboard layout actions, persistence and reset, canonical progress/recovery records, callback routing, audio activation, and transient search/dialog restoration. These tests use deterministic DOM fixtures. Packaged desktop and browser layout, assistive-technology behavior and live host operations still require runtime verification after integration.
