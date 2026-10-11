# Typed appearance color picker

The typography inspector uses registered Material Design 3 controls. Apply color invokes the original appearance mutation, preserving current target and layer resolution, validation, locks, history and rollback. Palette changes and shared rainbow speed use the same settings consumer.

## Representations and storage

Named colors, HEX/HEX8, RGB/RGBA, HSL/HSLA, HSV/HSB, HWB, CIELAB/LCH, OKLab/OKLCH and CMYK translate in both directions. Storage is 8-bit sRGB with alpha. Lab/LCH use D50 adaptation; OKLab/OKLCH use D65. Out-of-gamut drafts are rejected before clipping. CMYK is an unprofiled approximation, not a calibrated print proof. Round-trip quantization can change a channel by one byte.

Continuous hue and numeric saturation, brightness and alpha share one draft. Static named, recent and custom palettes never contain rainbow. Rainbow follows shared speed and reduced-motion settings. Contrast is unavailable without a known opaque relevant background.

## Platform capabilities

Copy requires an admitted clipboard service or browser clipboard API. Screen sampling requires browser EyeDropper and a user gesture. Sampling preserves alpha and requires Apply to save; cancellation, lock and disposal invalidate late results. Unsupported capabilities remain visibly unavailable. No external color service is contacted.

## Control explanations

<a id="entry"></a>
### Color entry

Enter a color in the selected translator notation.

The draft changes only; Apply color saves through the original appearance action.

Example: Try #6750a480 for a translucent violet.

<a id="space"></a>
### Color space

Choose which bidirectional notation the entry displays.

Translation retains the current 8-bit sRGB color and alpha.

Example: Choose HSV to edit hue, saturation and brightness.

<a id="hue"></a>
### Hue spectrum

Move continuously around the complete hue circle.

Updates the draft hue while retaining saturation, brightness and alpha.

Example: Hue 120 selects the green sector.

<a id="saturation"></a>
### Saturation

Set the draft distance from gray to a fully saturated hue.

Zero produces gray; one hundred retains the full hue.

Example: Saturation 50 softens a bright color.

<a id="brightness"></a>
### Brightness

Set HSV brightness from black to the current full hue.

Zero is black; one hundred retains the maximum channel.

Example: Brightness 70 darkens the draft without changing alpha.

<a id="alpha"></a>
### Alpha

Set transparency independently from the color channels.

Zero is transparent and one is opaque; accepted storage uses 8-bit alpha.

Example: Alpha 0.5 is approximately half opacity.

<a id="apply"></a>
### Apply color

Save the reviewed draft to this exact property and state.

One original mutation saves the color and its recent entry together.

Example: Apply a valid draft after reviewing the contrast readout.

<a id="copy"></a>
### Copy representation

Copy only the currently translated color representation.

Uses the admitted clipboard service and never copies other settings.

Example: Copy HEX8 when alpha must be retained.

<a id="eyedropper"></a>
### Pick screen color

Ask the supported browser color sampler to select one pixel after an explicit user action.

Only the selected sRGB color becomes a draft; no image or continuous screen data is collected.

Example: Cancel the browser sampler to retain the previous draft.

<a id="swatch"></a>
### Swatch grid

Load a static swatch into the draft.

A swatch does not save the target until Apply color is used.

Example: Choose a recent color and review it before applying.

<a id="name"></a>
### Custom color name

Name a local reusable static color.

The name labels the palette entry, not the target or application.

Example: Name a blue swatch Link blue.

<a id="save"></a>
### Save custom color

Save the current static draft and its name in the local palette.

Uses the original palette mutation and history route.

Example: Save a reviewed brand color for reuse.

<a id="remove"></a>
### Remove custom color

Remove this selected custom palette entry.

The target style and other palette entries remain unchanged.

Example: Remove an obsolete custom swatch without changing the text.

<a id="rainbow"></a>
### Animated rainbow

Use the renderer recognized rainbow marker for this property.

The marker is saved as structured data and never becomes a palette color string.

Example: Choose rainbow for an accent; reduced motion settles on one hue.

<a id="speed"></a>
### Rainbow speed level

Change the one shared rainbow level used by every target.

The existing level-to-duration mapping remains authoritative.

Example: Level 10 cycles faster than level 1.

<a id="reset"></a>
### Reset color override

Remove this explicit color override from the selected layer.

The current inherited target color becomes effective through the original mutation and history route.

Example: Reset a highlight override without deleting the palette.

<a id="search"></a>
### Search colors

Filter static palette entries by their visible name or representation.

Search does not modify colors or authorize a style change.

Example: Search blue to find named blue swatches.

<a id="clear-entry"></a>
### Clear color entry

Clear the unsaved notation without erasing the accepted target color.

Apply remains unavailable until a valid color is entered or selected.

Example: Clear a mistyped HEX8 value before replacing it.

<a id="clear-hue"></a>
### Clear hue draft

Clear the numeric hue draft before entering a new angle.

The accepted color remains unchanged and the incomplete draft cannot be applied.

Example: Clear an unwanted hue angle before entering 120.

<a id="clear-saturation"></a>
### Clear saturation draft

Clear the saturation percentage without saving a gray color.

A missing percentage is invalid until replaced.

Example: Clear a saturation typo and enter a value from 0 to 100.

<a id="clear-brightness"></a>
### Clear brightness draft

Clear the brightness percentage without saving black.

A missing brightness value prevents applying the incomplete color.

Example: Clear the brightness draft before entering 70.

<a id="clear-alpha"></a>
### Clear alpha draft

Clear the alpha draft without making the target transparent.

An empty alpha value is invalid, not zero.

Example: Clear an alpha typo before entering 0.5.

<a id="clear-speed"></a>
### Clear rainbow speed draft

Clear the unsaved shared speed level without changing the global level.

The existing global duration remains active until a valid integer is entered.

Example: Clear a typo before entering level 5.

<a id="clear-name"></a>
### Clear custom name

Clear only the unsaved custom color name.

The draft color and existing custom palette entries are retained.

Example: Clear an old label before naming a new custom swatch.

## Verification boundary

Source consumers cover conversions, invalid drafts, original rejection, palette changes, copy and sampling cancellation. Browser decoding, actual clipboard and sampling permission, native bridge availability, installed operation and rendered layout remain unverified. The full viewport, language, theme and scale matrix remains pending.
