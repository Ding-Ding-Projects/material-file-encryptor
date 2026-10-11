# Selection workbench guidance

Optional guidance sits immediately above the original drawing surface, Apply and Clear actions, guide controls and scoped searches. State samples have contextual explanations. Opening guidance is never required. Its final step invokes the original click or change consumer, retaining the original authorization, validation and history path.

Buttons use registered Material Design 3 outlined buttons; fields use outlined text fields. The accessible SVG keeps pointer drawing and keyboard equivalents: arrows move one unit, Shift moves ten, Space adds a point, Enter applies and Escape clears the draft. Pointer cancellation discards the unfinished stroke. Clearing the draft does not clear the saved layer mask.

Persistence consumers must return or resolve to `true`. Missing consumers, `false`, `undefined`, rejection, unavailable targets and stale instances never report an applied selection or saved guides. Guide candidates remain separate from accepted geometry until confirmation. Destruction removes owned listeners, help entries, palette commands, searches and preview stylesheets. Pending operations are not replayed. Static samples copy neither original actions nor field values or target child text.

The host supplies `translate`, `getLanguage`, `isAvailable`, `attachSearch`, `registerHelp`, `registerCommands`, `openGuidanceHelp` and `guidanceHelpBase`. Merge `WORKBENCH_GUIDANCE_COPY` into its translation dictionary. The availability callback checks the current target, layer lock and editor lifetime; the original mutation remains authoritative. The existing scoped search adapter owns its adjacent regular-expression builder. Without that adapter, search stays disabled with an adjacent explanation.

## Verification and remaining acceptance

Focused mounted component checks cover optional placement, one original admission, awaited results, rejected consumers, stale-instance disposal, guide validation and rollback, private-value omission and stylesheet ownership. These synthetic DOM checks establish source behavior only. Product build, rendered Material Design 3 parity, browser keyboard accessibility, all three language modes and native/site captures remain pending. This unit does not fix the separate public preferences theme/layout report or complete the full image editor.

## Control concepts

### drawing

Build a polygon draft with pointer strokes or keyboard points. Coordinates stay within zero to one hundred. Use at least three vertices. Escape and pointer cancellation discard drafts without changing the saved mask.

### apply

Commit the current polygon through the original layer mutation. At most thirty-two sampled points are stored. Only explicit confirmation reports success; rejected drafts remain available for correction.

### clear

Discard the unfinished drawing only. This does not remove the saved selection. Clearing is unavailable during a pending mutation.

### guide-x

Add a vertical snapping reference at fifty percent. Vertical and horizontal references share a limit of twenty. Undo or remove the reference to reverse it.

### guide-y

Add a horizontal snapping reference at fifty percent. It changes point alignment after confirmed persistence and does not move existing polygon vertices.

### guide-edit

Move one identified guide along its existing axis. Enter a finite percentage from zero to one hundred, such as 33.3. Empty or stale rows cannot submit. Rejection retains the previous saved position.

### guide-remove

Remove one identified guide after the original consumer confirms. Other references and the polygon remain unchanged. Re-add it or undo the saved revision to recover.

### tool-search

Find drawing actions using the host's scoped text search and adjacent regex builder. Search does not change masks or guides. Clear the query to restore discovery.

### preview-search

Find named static appearance samples. Search changes comparison discovery only, never saved appearance. Clear its query to compare all supplied states.

### preview

Inspect a supplied state snapshot. The sample is not a live interaction or completed action. No private input value is copied. Reopen comparison to obtain a fresh snapshot.

### tool-search-clear

Clear the original scoped drawing query and return focus to its editable input. Disabled or read-only inputs remain unchanged. This restores discovery without changing the drawing.

### preview-search-clear

Clear the original state query to restore all supplied samples. It does not apply any sample to the target. A disabled or read-only query cannot be cleared.
