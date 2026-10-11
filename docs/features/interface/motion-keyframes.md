# Typed keyframe inspector

The Animation and Transition tab delegates keyframe editing to a registered Material Design 3 inspector. It edits the selected track through the original appearance mutation, validation, history and rollback path. Normalized offsets and absolute or relative milliseconds are explicit modes; switching modes removes conflicting coordinates. Multi-frame movement rejects out-of-range results rather than clipping them.

## Value and capability boundaries

The selected frame exposes a direct CSS value or computed starting value, an optional numeric value and unit draft, segment easing, composition and hold. Numeric drafts do not save until Apply value. Unsupported values remain in the portable model; renderer acceptance of syntax does not prove interpolation. Full motion paths, multi-track timeline editing, per-property transition value workflows and complete rendered capability acceptance remain separate unfinished work.

## Control explanations

<a id="select"></a>
### Select keyframe

Choose the frame edited by the inspector without changing saved motion.

<a id="multi"></a>
### Include in selection

Include this frame in a single atomic move, copy or removal.

<a id="mode"></a>
### Keyframe time mode

Choose normalized offset, absolute milliseconds or relative milliseconds; changing mode removes conflicting time fields.

<a id="time"></a>
### Keyframe position

Set the selected timing coordinate. Invalid positions are rejected rather than clamped.

<a id="value"></a>
### Keyframe value

Set the property value or computed start; renderer rejection preserves the saved frame.

<a id="unit"></a>
### Value unit

Choose an explicit CSS unit for a numeric property value. Unit changes remain drafts until Apply value.

<a id="apply"></a>
### Apply value

Apply the numeric value and unit once through the original appearance mutation.

<a id="easing"></a>
### Segment easing

Set the selected segment timing function; the renderer must accept its syntax.

<a id="composition"></a>
### Keyframe composition

Choose auto, replace, add or accumulate for this frame only.

<a id="hold"></a>
### Hold segment

Choose a discrete held segment instead of pretending the value interpolates smoothly.

<a id="add"></a>
### Add keyframe

Append one computed frame at offset one using the original history route.

<a id="copy"></a>
### Copy keyframes

Copy selected frames into this inspector only, preserving portable metadata.

<a id="paste"></a>
### Paste keyframes

Append the local copied frames after validating the complete resulting track.

<a id="remove"></a>
### Remove selected keyframes

Remove the selected set as one reversible original mutation.

<a id="move"></a>
### Move selected keyframes

Move selected normalized offsets together; timed frames require their own time control.

<a id="reorder"></a>
### Move frame earlier

Change authored list order without silently changing timing coordinates.

<a id="later"></a>
### Move frame later

Move this authored frame one position later and retain its metadata.

<a id="reset"></a>
### Reset selected frame

Reset this frame to computed offset zero without removing other frames.

<a id="clear"></a>
### Clear value draft

Clear the unsaved numeric draft; empty input cannot be applied as zero.

## Verification boundary

Source consumers verify finite timing, invalid offset refusal, original rejection and disposal. Built motion, native progress, keyboard/screen-reader interaction and the complete viewport, language, theme and scale matrix remain unverified. A static image or saved value cannot prove motion.
