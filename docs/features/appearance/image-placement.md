# Typed image placement

## Delivery state

This source unit provides a registered Material Design 3 inspector and shared geometry, now wired into the original appearance editor. Its caller resolves the current target/state/group/layer after rollback and invalidates old controls on render, navigation, close and disposal. No rendered, installed or pixel acceptance is claimed. Integration details remain in `design/image-placement/HANDOFF.md`.

## Placement model

Crop coordinates are percentages of the normalized PNG source. Crop width and height must be positive; the rectangle must remain inside the source. Explicit `fit` is `contain`, `cover`, or `stretch`. Focal X/Y are percentages from 0 to 100 that align remaining space (contain) or overflow (cover). Stretch fills both dimensions; focal coordinates have no visible effect in stretch.

The shared geometry returns source pixels and destination pixels. Live SVG converts the destination into its target coordinates; the raster worker uses the same destination directly, with clipping to its output bounds. No pixel decoding, color conversion, silent crop clamp or source-byte mutation occurs in this geometry module.

Existing models without `fit` retain live containment and raster stretching. The inspector explains this historical difference and requires an explicit fit before Apply. Reset delegates to the original reset action and can restore legacy placement. This is an explicit migration, not automatic rewriting of existing images.

## Controls and original actions

Crop, focal point, translation, scale, rotation, skew, opacity and blend are drafts. Apply validates the entire draft, then invokes the original mutation exactly once. Empty, malformed and out-of-range values cannot save. Reset invokes the supplied original reset action. The integrated caller owns current-layer resolution, locks, undo/history, persistence and rollback. No second settings store is created.

Pending operations block overlapping actions. Disposal removes listeners, guidance and search ownership. The caller must reject any stale or locked target before mutation. Search uses the host adapter, including its regular-expression builder; it is visibly unavailable without that adapter. English, Cantonese and bilingual labels and optional guidance are available. Language changes require caller remounting, preserving the original editor's lifecycle.

## Security and limits

Only already normalized local PNG sources reach the existing renderers. No uploaded SVG, arbitrary URLs, new decoder, format importer or export is introduced. Geometry does not weaken normalization bounds, worker cancellation or processing admission. Local revision/export image-pixel omission remains unchanged. Safe areas, full compositor depth, complete editable image export, other source formats and genuine rendered acceptance remain unfinished.

## Verification

Focused tests exercise crop/fit/focal arithmetic, legacy defaults, invalid values, the actual SVG and worker consumers, one original mutation, rejected-save retry, lock/disposal and pending operation exclusion. Actual appearance-caller checks also cover persisted fit/focal values, storage rollback/retry, original Undo, locked/stale controls, effective language and School-mode precedence. These are source/component checks, not browser layout or accessibility acceptance.

<a id="crop0"></a>
### crop0

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="crop1"></a>
### crop1

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="crop2"></a>
### crop2

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="crop3"></a>
### crop3

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="focalX"></a>
### focalX

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="focalY"></a>
### focalY

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="x"></a>
### x

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="y"></a>
### y

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="scaleX"></a>
### scaleX

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="scaleY"></a>
### scaleY

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="rotate"></a>
### rotate

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="skewX"></a>
### skewX

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="skewY"></a>
### skewY

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="opacity"></a>
### opacity

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="apply"></a>
### apply

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="reset"></a>
### reset

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="search"></a>
### search

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-search"></a>
### clear-search

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-crop0"></a>
### clear-crop0

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-crop1"></a>
### clear-crop1

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-crop2"></a>
### clear-crop2

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-crop3"></a>
### clear-crop3

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-focalX"></a>
### clear-focalX

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-focalY"></a>
### clear-focalY

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-x"></a>
### clear-x

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-y"></a>
### clear-y

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-scaleX"></a>
### clear-scaleX

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-scaleY"></a>
### clear-scaleY

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-rotate"></a>
### clear-rotate

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-skewX"></a>
### clear-skewX

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-skewY"></a>
### clear-skewY

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="clear-opacity"></a>
### clear-opacity

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="fit-contain"></a>
### fit-contain

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="fit-cover"></a>
### fit-cover

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="fit-stretch"></a>
### fit-stretch

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="blend-normal"></a>
### blend-normal

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="blend-multiply"></a>
### blend-multiply

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="blend-screen"></a>
### blend-screen

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="blend-overlay"></a>
### blend-overlay

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="blend-darken"></a>
### blend-darken

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="blend-lighten"></a>
### blend-lighten

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.

<a id="blend-difference"></a>
### blend-difference

Review the adjacent typed draft and its contextual guidance. Apply uses the original appearance action; no control owns separate persistence.
