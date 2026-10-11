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

The following 34 handwritten concepts have bilingual explanation records. These 34 concepts mount the reviewed optional guide immediately above their exact fields, use the original change event and await its admitted consumer. A mounted-component test covers guided numeric persistence. Other motion controls, complete documentation-reader integration and genuine browser guidance acceptance remain pending.

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


### track-name

Track name

Name this track in the selectable track strip.

Plain text up to 160 characters.

Animation, or Transition for a new transition rule.

Changes its visible label without changing its stable identifier or dependencies.

Name an opacity track Fade in.

Control characters and overlong names are rejected.

Reset the name or undo its appearance revision.


### parallel-group

Parallel group

Label tracks that belong to the same authored parallel group.

Empty or a plain-text group name.

Empty.

Retains a grouping label; actual timing still comes from offsets and dependencies.

Use entrance on opacity and transform tracks with equal offsets.

A group name does not silently synchronize independently authored offsets.

Clear the group label to remove this organizational grouping.


### sequence-offset

Sequence offset

Move this track relative to the resolved predecessor boundary.

Signed fractional milliseconds.

0 milliseconds.

Adds directly to the native start delay after dependency resolution.

Use -50 to overlap the predecessor ending by 50 ms.

The complete dependency graph must remain finite and acyclic.

Reset Sequence offset to 0 and inspect the predecessor link.


### stagger-offset

Stagger offset

Space this track using its authored position in the track list.

Signed fractional milliseconds per list position.

0 milliseconds.

Adds stagger multiplied by this track index; moving a track changes this contribution.

Use 25 for a track at index 2 to add 50 ms.

The resulting native delay must be accepted by the renderer.

Reset Stagger offset to 0 to remove list-position spacing.


### target-scope

Target scope

Choose whether this effect changes the element or a real independent image layer.

element or layer.

element.

Layer scope needs an actual rendered image-layer node; cascading CSS layers cannot supply one.

Choose layer to move one image overlay without moving its target element.

Missing independent layer nodes produce an unavailable preview with authored values retained.

Choose element or create a real image layer before using layer scope.


### target-state

Target state

Restrict this track to an explicit interaction or result state.

One of the documented normal, interaction, validation, loading or result states.

The selected appearance state when adding a track; resetting a track uses normal.

An inactive inherited layer cancels its native handles; state filters also apply to reduced motion.

Choose hover for an effect that belongs only to the hovered target.

Unknown states are rejected and unavailable states are never claimed active.

Choose normal or inspect the state inheritance setting.


### composition

Composition

Choose how this effect combines with existing property values.

replace, add, or accumulate.

replace.

Native effect composition and authored track order determine overlapping-property precedence.

Use add for a supported transform contribution above the base transform.

Renderer support depends on the property and its value type.

Choose replace and disable competing tracks to isolate the effect.


### iteration-composition

Iteration composition

Choose whether completed iterations accumulate into later iterations.

replace or accumulate.

replace.

Accumulation is applied only when the native effect exposes iterationComposite.

Use accumulate with a repeated supported transform.

An unsupported iterationComposite capability cancels the attempted handle and reports unavailable.

Reset Iteration composition to replace to use the ordinary renderer path.


### trigger

Trigger

Choose the target event or state change that starts this effect.

The listed state, pointer, focus, drag, visibility and explicit command events.

entry.

Starts animation only; it never invokes protected product operations.

Choose hover for a pointer-entry effect.

Unlisted events are rejected before saving.

Return to entry and restart preview to isolate event delivery.


### from-state

From state

Require a particular previous state before accepting this trigger.

any or one documented target state.

any.

Filters transitions using the state set captured before the change.

Choose normal for an entry from the ordinary state.

A mismatched previous state leaves the effect unstarted.

Choose any to remove the previous-state restriction.


### to-state

To state

Require the destination state when this trigger is delivered.

One documented target state.

normal.

Filters the effect against the current target state set.

Choose invalid for a validation-result animation.

Unknown destination states are rejected.

Choose normal or correct the target state that drives the effect.


### progress-threshold

Progress threshold

Set the minimum delivered visibility progress for this trigger.

A fractional value from 0 through 1.

0.

Visibility events below the threshold do not start the track.

Use 0.5 to require at least half visibility.

Values outside 0 through 1 are rejected; ordinary events deliver full progress.

Reset Progress threshold to 0 to remove the visibility restriction.


### debounce

Debounce

Suppress repeated deliveries close to this track last accepted trigger.

0 through 60000 milliseconds.

0 milliseconds.

Uses the runtime clock per track, without delaying product actions.

Use 250 to suppress rapid duplicate pointer events.

Negative or excessive intervals are rejected.

Reset Debounce to 0 when investigating missing repeated triggers.


### retrigger

Retrigger behavior

Decide what a new trigger does to an already running handle.

restart, ignore, reverse, or replace.

restart.

Ignore keeps a running handle; reverse reverses it; restart and replace cancel then start a fresh effect.

Use ignore to keep a hover effect from restarting while it runs.

A completed handle may start again; its fill is cancelled on replacement.

Choose restart and stop existing preview if reentrancy is confusing.


### cancel-on-exit

Cancel on exit

Choose whether leaving this track active state cancels its effect.

true or false.

true.

Cancels the native handle on state exit; inactive inherited layers still stop independently.

Keep true for a hover effect that should disappear when the pointer leaves.

Only Boolean values are accepted after field conversion.

Restore true or press Stop to release a lingering effect.


### trigger-priority

Priority

Order effects delivered by the same trigger.

A finite value from -1000 through 1000.

0.

Lower priorities start first; later authored effects and composition determine overlapping presentation.

Use 10 to start a highlight after a priority 0 base effect.

Priority does not authorize product commands or change event scope.

Reset Priority to 0 to restore ordinary authored ordering.


### timeline-source

Timeline source

Choose the native clock that drives this effect.

document, scroll, or view.

document.

Document uses milliseconds; native scroll and view clocks use progress.

Choose scroll to tie motion to the chosen scroll source.

Unavailable native timeline constructors produce a retained-model unavailable status.

Choose document for a renderer without scroll or view timeline support.


### timeline-element

Timeline element

Identify the actual element supplying native timeline progress.

target, parent, or document scrolling element.

target.

Scroll timelines use this source; view timelines observe this subject.

Choose parent when the target sits inside the relevant scrolling container.

Native construction failures are contained and shown without abandoning listeners.

Return to target or inspect which ancestor actually scrolls.


### timeline-axis

Timeline axis

Choose the physical or writing-mode axis measured by the native timeline.

block, inline, x, or y.

block.

Changes which scroll movement or view progression advances this effect.

Choose x for a horizontal scrolling strip.

Only native axis choices are stored.

Reset Timeline axis to block for the ordinary writing flow.


### view-inset

View inset

Adjust the visibility range used by a native view timeline.

A renderer-supported inset string or auto.

auto.

Changes native view-progress boundaries while retaining authored keyframes.

Use 10% when the renderer supports an inset visibility band.

Safe syntax is preserved, but invalid native inset construction reports unavailable.

Reset View inset to auto after a native constructor rejection.


### attachment-start

Attachment start

Set where the native effect attaches to the progress timeline beginning.

normal or a renderer-supported attachment range value.

normal.

Passes rangeStart to the native animation options.

Use entry 0% when supported to attach at the beginning of entry.

Native unsupported range values report unavailable instead of being claimed applied.

Reset Attachment start to normal to restore the native default range.


### attachment-end

Attachment end

Set where the native effect ends within the progress timeline.

normal or a renderer-supported attachment end value.

normal.

Passes rangeEnd without changing the stored timeline playback range.

Use exit 100% when supported to finish at the end of exit.

The native renderer validates attachment ordering and accepted range syntax.

Reset Attachment end to normal if the effect never reaches completion.

