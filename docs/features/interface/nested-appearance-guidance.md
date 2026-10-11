# Nested appearance control guidance

This source unit covers eleven layer navigation and local logo controls. Optional guidance immediately precedes the direct control, dispatches the same event and awaits its recorded consumer. Existing validation, permissions and history remain authoritative. Other nested editor controls, rendered acceptance and replacement of all current screenshots remain pending.

### nested-select-state

Interaction state

Purpose: Choose which interaction state receives subsequent layer edits.

Options: normal, hover, focus, active, selected, disabled, dragged, invalid, loading, success, warning, error

Default: "normal"

Effects: Selecting hover does not simulate a hover or change the normal state.

Example: Choose focus before editing a keyboard focus outline.

Validation: Use one of the twelve registered states.

Recovery: Return to normal to inspect the base appearance.


### nested-select-layer

Selected layer

Purpose: Choose the layer that property fields and layer actions operate on.

Options: One existing layer in the current group.

Default: "0"

Effects: Selection changes the editor target without changing stored properties.

Example: Select the second layer before renaming it.

Validation: The layer must exist in the currently open group.

Recovery: Select the previous layer again; selection itself creates no style revision.


### nested-toggle-visible

Layer visibility

Purpose: Include or exclude this layer from the rendered composition.

Options: Show or Hide this layer.

Default: true

Effects: Hiding retains the layer data while removing its visual contribution.

Example: Hide a shadow layer to compare the remaining composition.

Validation: Use the existing visibility action for this exact layer.

Recovery: Show the same layer again or use appearance Undo.


### nested-toggle-locked

Layer edit lock

Purpose: Prevent property editing of this layer until its edit lock is released.

Options: Lock layer or Unlock layer.

Default: false

Effects: This editor lock is not a profile password or a credential permission.

Example: Lock a finished background layer before working above it.

Validation: The original layer lock handler decides the state transition.

Recovery: Use Unlock layer for the same layer.


### nested-open-group

Open group

Purpose: Navigate into an editable group to select its child layers.

Options: Open the selected editable group.

Default: "Root group"

Effects: Opening a rasterized editable group removes its generated raster preview through the original action.

Example: Open a text decoration group to edit its underline child.

Validation: Locked groups and immutable embedded sources cannot be entered.

Recovery: Return with Back to parent group; detach an embedded copy only through its separate action.


### nested-parent-group

Back to parent group

Purpose: Leave the current group and select its containing layer.

Options: Return one group level.

Default: "Root group"

Effects: Navigation preserves child properties and does not flatten the group.

Example: Return after editing a nested border layer.

Validation: Available only while a child group is open.

Recovery: Open that group again to continue editing its children.


### nested-logo-file

Choose a local logo

Purpose: Choose a static local image for conversion into the displayed logo.

Options: One static PNG, JPEG or WebP file selected locally.

Default: null

Effects: The original converter stores a flattened 128 by 128 PNG locally.

Example: Choose a square static PNG with a transparent background.

Validation: PNG, JPEG or WebP only; at most 4 MiB, 8192 per dimension and 16000000 decoded pixels.

Recovery: Choose another valid image, or Reset logo to restore the original.


### nested-logo-fit

Logo fit

Purpose: Choose whether the whole image fits or fills the square logo canvas.

Options: contain retains the whole image; cover fills the square.

Default: "contain"

Effects: Cover crops overflowing image edges; contain can leave transparent margins.

Example: Use contain to retain a wide wordmark.

Validation: Only contain and cover are offered by the original toggle.

Recovery: Toggle back to contain and inspect the preview.


### nested-logo-x

Horizontal focal point

Purpose: Position the image horizontally within the logo conversion canvas.

Options: 0 through 1, with increments of 0.01.

Default: 0.5

Effects: The offset affects remaining space or cropped overflow, not image scale.

Example: Move toward the right to retain a subject near the right edge in cover mode.

Validation: Use the original range from 0 to 1 in steps of 0.01.

Recovery: Return to 0.5 and inspect the converted preview.


### nested-logo-y

Vertical focal point

Purpose: Position the image vertically within the logo conversion canvas.

Options: 0 through 1, with increments of 0.01.

Default: 0.5

Effects: The vertical offset determines which top or bottom overflow is cropped.

Example: Move upward to retain a face near the top of a portrait.

Validation: Use the original range from 0 to 1 in steps of 0.01.

Recovery: Return to 0.5 and inspect the converted preview.


### nested-logo-reset

Reset logo

Purpose: Remove the locally stored custom logo and restore the original presentation.

Options: Restore the original logo; no file is selected afterward.

Default: null

Effects: The original reset clears the chosen file and notifies the logo consumer with null.

Example: Reset after trying a seasonal logo.

Validation: Run only through the original reset control and its current permissions.

Recovery: Choose the original local image again to recreate a custom logo; reset has no independent backup.

## Failure, security and verification

Blocked, disabled, removed and unadmitted controls cannot execute a guided action. Consumer rejection, storage failure and invalid images remain failures rather than wizard success. Logos are converted locally to flattened PNG without network reads. Editor disposal cancels guidance and removes listeners. Source consumer tests do not prove browser, installed or visual acceptance.

## Logo action control conversion

Fit and Reset logo use the registered Material outlined-button primitive with explicit button type. Their original event-owned callbacks and guidance promises remain unchanged, including explicit false and rejected completion, disabled or canceled admission, and disposal. The file picker, upload presentation, focal sliders and raster processing are outside this conversion and remain separate acceptance work. Mounted consumer checks cover constructor completeness and unsuccessful admission; real vendor rendering, keyboard behavior and complete Material Design 3 conformance remain unverified.
