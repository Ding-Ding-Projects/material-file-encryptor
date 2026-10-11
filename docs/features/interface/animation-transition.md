# Animation and Transition authoring

## Current boundary

This is an incomplete source implementation draft shared by the installed application and public documentation appearance editor. The model, native animation adapter and authoring controls are preserved. Focused checks cover mounted numeric and keyframe controls, local schedule boundaries, static comparison, timing validation, reduced-motion state filtering, completed-handle retriggering and renderer-exception teardown. Complete guidance integration and rendered acceptance remain pending. Saved values and injected API tests do not prove visible motion. No current capture or timed recording is claimed.

## Authoring and rendering

Motion is stored on each appearance layer. The selected element, layer and state remain explicit. The Animation and Transition tab exposes ordered tracks and rules, enable/mute/solo, grouping, dependencies, offsets, stagger, property entry, keyframes, segment easing, timing, markers, triggers and native timeline options. Numeric controls remain available beside timeline scrubbing. Undo, redo, appearance revisions, named presets, style copying, reset and validated JSON portability carry the motion data.

The adapter calls the target renderer's native animation API. The property chooser enumerates computed renderer properties and accepts explicit custom-property names. CSS parsing alone does not establish interpolation. A renderer rejection is shown and portable authored values remain intact. Element tracks animate the exact target. Independent layer tracks require a real rendered image-layer node; CSS layers cascading onto one element do not create independent pixel surfaces. Replacing an image overlay cancels its old native consumer and binds the replacement, so continuity across overlay reconstruction still needs timed acceptance.

Timing includes fractional milliseconds, automatic duration, signed delay/end delay, finite or infinite repetitions, iteration start, direction, fill and signed/zero playback rate. Keyframes retain explicit offsets or absolute/relative times, computed values, per-segment easing and composition. Native document timelines use milliseconds. Scroll/view timelines are feature-detected, with source, axis, inset and attachment ranges preserved; progress seeking uses feature-detected native percentage values, and frame stepping explicitly requires document time. Both still require browser verification.

## Capability and security limits

Native repeated-iteration delay and spring physics are unavailable through this renderer adapter. Their portable settings remain visible and prevent an unsupported preview from being called applied. Named/Bezier/linear/step easing is passed to the renderer's timing-function parser. Composition and iteration accumulation are used only where the renderer exposes them. The existing shared rainbow speed remains authoritative and its reserved properties cannot be overridden through a track.

Triggers are limited to the selected target's state, allowlisted interaction events, visibility progress and explicit animation commands. They never run code, fetch resources, authenticate, or perform protected product operations. Imported CSS values reject URLs and declaration breakout. Versioned motion input has a byte budget, finite numeric validation, cycle detection and prototype-key rejection; unknown future data stays portable without execution.

Reduced-motion presentation retains the authored model, cancels native handles and uses a static final value. Preview playback is paused after 30 seconds and releases its animation-frame observer on destruction. Application/OS preference propagation, exact state inheritance, playback interruption, overlapping properties and layer reconstruction still need real timed verification. Local clock schedules select named presets using dates, overnight windows, timezone, weekdays and priority; outside matching rules the authored model returns. They never contact providers. Complete per-control guided documentation remains unfinished integration work.

## Verification and capture queue

The handwritten capability matrix identifies implementation and consumer boundaries. Tests exercise portable appearance round trips, timing validation, dependency cycles, actual target API calls, transitions, event scope, reduced-motion cancellation and teardown. Negative source checks remove a tab, setting or consumer. These are source/API-boundary results, not built renderer evidence.

After a pinned build is authorized, both surfaces require every capability driven through the real editor, per-click captures plus timed recording or sampled computed styles, exact timing/trigger assertions, reload and reduced-motion checks, and bounded resource teardown. Every current README, documentation, wiki, gallery and download-presentation capture must be replaced with inspected source-bound captures. Preserve originals as clearly labelled history until replacements and references are verified. Generated images cannot substitute.

## Standards

- [Web Animations](https://www.w3.org/TR/web-animations-1/)
- [Scroll-driven Animations](https://drafts.csswg.org/scroll-animations-1/)

No HTTP API is introduced; a Postman collection is not applicable.

## Explicit timing guidance inventory

The following twelve handwritten concepts have bilingual explanation records. Other motion controls and actual above-control mounting remain pending. These entries are documentation, not proof of a mounted wizard.

### duration

Duration

Set the time occupied by one iteration of this track.

Nonnegative fractional milliseconds or auto.

300 milliseconds.

Changes keyframe spacing and dependent-track start times.

Use 125.5 for a short precise fade.

The model rejects negative or nonfinite duration; native progress timelines decide auto duration.

Reset Duration to 300 or undo the appearance revision.


### start-delay

Start delay

Move this effect relative to its resolved sequence start.

Signed fractional milliseconds.

0 milliseconds.

Positive values wait; negative values begin partway through the effect.

Use -100 to enter a 300 ms effect after its first 100 ms.

Only finite numbers within the portable numeric range are accepted.

Reset Start delay to 0 to remove the lead or wait.


### end-delay

End delay

Adjust the interval after this track before its dependency completes.

Signed fractional milliseconds.

0 milliseconds.

Affects computed end timing and the start of tracks depending on this track.

Use 200 to leave a pause before a dependent effect.

The native renderer validates the resulting effect timing.

Reset End delay to 0 if the sequence waits unexpectedly.


### repeat-count

Repeat count

Choose how many iterations this effect contributes.

Nonnegative finite count, including fractions, or infinite.

1 iteration.

Changes active duration; an infinite predecessor cannot have a dependent track.

Use 2.5 to play two iterations and half of the next.

Dependency validation rejects an infinite track used as a predecessor.

Restore 1 or remove the dependent link before choosing infinite.


### iteration-start

Iteration start

Select the iteration position sampled when the active interval begins.

Nonnegative fractional iteration index.

0.

Shifts the first sampled keyframe position without deleting authored frames.

Use 0.5 to start halfway through the first iteration.

Negative and nonfinite iteration starts are rejected.

Reset Iteration start to 0 to begin at the first frame.


### playback-rate

Playback rate

Set the authored speed and direction of this native animation handle.

Finite signed rate from -100 to 100; zero holds time.

1.

Multiplies native playback speed independently of the timeline preview speed control.

Use -1 for reverse-rate playback or 0.5 for half speed.

Rates outside the supported range are rejected before saving.

Reset Playback rate to 1, then restart the preview.


### repeat-delay

Repeat delay

Retain a requested pause between repeated iterations for portability.

Nonnegative fractional milliseconds.

0 milliseconds.

A nonzero value makes native preview unavailable because this adapter has no repeat-delay timing member.

Keep 150 in an imported preset to preserve its requested behavior.

The authored value is validated and retained; it is never silently ignored during playback.

Reset Repeat delay to 0 to enable this renderer preview.


### direction

Direction

Choose the orientation of each repeated iteration.

normal, reverse, alternate, or alternate-reverse.

normal.

Alternating modes reverse every other iteration while preserving keyframe order.

Use alternate with two repeats for an outward and return movement.

Only the four native direction choices are accepted.

Reset Direction to normal if movement starts from the unexpected end.


### fill

Fill

Choose whether effect values apply outside the active interval.

none, forwards, backwards, both, or auto.

none.

Controls before-delay and after-finish presentation; it does not change saved base styling.

Use forwards to hold the final effect after completion.

The model accepts only native fill modes.

Choose none or stop playback to release the effect.


### global-easing

Global easing

Shape the overall time progression of this effect.

Named easing, cubic-bezier(), steps(), or supported linear() stops.

linear.

Transforms effect progress before per-segment easing is applied.

Use cubic-bezier(0.4, 0, 0.2, 1) for a standard smooth curve.

Unsafe CSS is rejected; unsupported renderer syntax retains its authored value with an unavailable preview.

Reset Global easing to linear to remove curve shaping.


### animated-property

Animated property

Identify the exact renderer property changed by this keyframe track.

Computed renderer property names or a valid custom-property name.

opacity.

Every keyframe value is assigned to this property on the selected target scope.

Choose transform and enter translateX(20px) as a frame value.

Property names and values are validated; parser acceptance alone does not prove interpolation.

Return to opacity and numeric values to isolate a rejected property.


### after-track

After track identifier

Start this track after another authored track completes.

Empty or an existing finite predecessor track identifier.

Empty, with no predecessor.

Adds the predecessor end time to this track offset and stagger.

Enter the fade track identifier to move only after the fade completes.

Missing identifiers, cycles and infinite predecessors are rejected.

Clear the predecessor identifier to restore an independent start.

