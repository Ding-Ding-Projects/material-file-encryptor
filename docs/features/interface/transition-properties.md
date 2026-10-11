# Typed transition property values

The Animation and Transition workspace provides a registered Material Design 3 property inspector. Version 1 keeps its shared property list and shared endpoint semantics until an explicit migration action. Version 2 stores ordered property rows with stable identifiers and independent from/to values. The existing appearance mutation remains the only settings, lock, rollback and history route.

## Version and migration boundaries

Untouched version 1 data is not upgraded. Explicit per-property editing upgrades the containing motion model to version 2 in one original action, preserving property order and the old endpoint values. Older version-1-only readers reject version 2 rather than silently rendering shared values. Unknown portable row metadata survives validation and round trips. Duplicate identifiers, duplicate properties, invalid identities, executable CSS, URLs and prototype keys are rejected.

A legacy all-properties rule remains unchanged until explicit expansion. Expansion snapshots only the actual target computed-style property catalogue. It is not a promise that every listed property interpolates or that future renderer properties are automatically added. No arbitrary recent-property or count slice is used.

## Runtime and capability truth

One shared resolver supplies playback, reduced-motion refresh, static after comparison and restoration. Both endpoints are checked. Computed endpoints are sampled independently for each property. Unsupported rows stay portable, produce exact unavailable reasons and do not enter accepted animation frames. CSS syntax acceptance does not prove interpolation, particularly for unregistered custom properties. Per-property allow-discrete is retained but this Web Animations adapter cannot preview that setting. Rule-level duration, delay and easing remain shared; individual property timing, complete timeline and motion-path authoring remain unfinished.

## Reader inventory

The motion model validates both versions and derives the existing property projection from authoritative version 2 rows. The motion editor delegates to this inspector. The runtime uses the same resolver for every endpoint consumer. The appearance caller consumes the validated property projection for stylesheet precedence and passes the complete motion model to the runtime registry. Appearance serialization, local revisions, undo/redo, presets and imports preserve the full model. The local schedule matcher selects a whole validated preset, including its version. The keyframe inspector reads animation tracks only and preserves the surrounding motion version. No native motion reader is introduced.

## Control explanations

<a id="migrate"></a>
### Edit per-property values

Upgrade this rule explicitly to version 2, retaining its property order and shared starting values.

<a id="expand"></a>
### Expand actual renderer properties

Replace legacy all with an explicit snapshot of this target renderer catalogue, then edit each property independently.

<a id="select"></a>
### Select property

Choose the property row to edit without changing saved motion.

<a id="property"></a>
### Property name

Choose a renderer property or enter a safe custom property; syntax does not prove interpolation.

<a id="add"></a>
### Add property

Append an independently identified computed-to-computed property row after complete validation.

<a id="remove"></a>
### Remove property

Remove this property without changing the remaining rows; at least one row must remain.

<a id="earlier"></a>
### Move property earlier

Change authored property order without changing endpoint values or rule timing.

<a id="later"></a>
### Move property later

Move this row after its successor and preserve its stable identity.

<a id="from"></a>
### Starting value

Set this property starting CSS value or computed target value. Both endpoints are checked independently.

<a id="to"></a>
### Ending value

Set this property ending CSS value or computed target value without reusing another property value.

<a id="number"></a>
### Numeric endpoint draft

Enter a finite numeric endpoint draft; no saved change occurs before Apply endpoint.

<a id="unit"></a>
### Endpoint unit

Choose number, px, %, em, rem or deg; the property must accept the resulting CSS.

<a id="apply"></a>
### Apply endpoint

Apply the selected endpoint numeric draft once through the original motion mutation.

<a id="clear"></a>
### Clear endpoint draft

Clear the unsaved numeric draft; empty cannot silently mean zero.

<a id="behavior"></a>
### Discrete behavior

Retain normal or allow-discrete per property; unsupported adapter preview is visibly unavailable.

<a id="reset"></a>
### Reset property values

Reset only this row to computed endpoints and normal behavior, retaining its identity and portable metadata.

## Verification boundary

Source consumers cover legacy compatibility, explicit migration, independent endpoints, strict admission, original rejection, rollback/retry, locks, presets, schedules, reduced motion, comparison and removed-consumer negatives. Native API arguments are source consumer evidence, not rendered interpolation. Built timed recordings, keyboard/screen-reader interaction and the complete viewport/language/theme/scale matrix remain pending.
