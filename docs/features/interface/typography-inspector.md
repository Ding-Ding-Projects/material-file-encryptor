# Typed typography inspector

The per-element appearance editor provides bounded typography controls through its existing layer mutation, validation, persistence and undo route. Font families and variable axes retain the admitted font workflow. The live sample follows the current accepted style; failed storage does not become a successful preview.

This source unit is not rendered acceptance. Installed exact-face support remains conservative. Highlight changes the element background, vertical alignment depends on layout, and the typed shadow editor authors one shadow while retaining existing multiple-shadow values until explicit replacement. The complete color picker and image editor are separate work.

## Search

Search filters property names inside this inspector. Clearing the query restores every property. Search never changes a saved style. Each property offers optional guidance immediately above the direct control. Guidance invokes that original control, including validation and locks.

## Validation and recovery

Numeric values must be finite and bounded. Sizes use px, pt, em or rem; relative sizes are additionally capped at 32. Colors use the existing parser. Renderer-unsupported saved values remain displayed and portable. Reset removes the explicit property override, allowing the remaining cascade to apply. Existing appearance Undo and Redo retain ownership of revision recovery.

<a id="fontSize"></a>
## Font size

Changes glyph size without scaling the surrounding workspace.

Default: 16px. The adjacent typed control validates syntax and renderer support.

Example: 24px makes a heading larger.

<a id="fontWeight"></a>
## Font weight

Selects the admitted face weight; a static face may synthesize intermediate weights.

Default: 400. Allowed range: 1 to 1000.

Example: 700 requests bold text.

<a id="fontStyle"></a>
## Font style

Selects normal, italic or oblique rendering; installed exact-face admission remains conservative.

Default: normal. Choices: normal, italic, oblique.

Example: italic requests a slanted face.

<a id="fontVariant"></a>
## Capitalization variants

Uses small-cap glyphs where the chosen face supports them.

Default: normal. Choices: normal, small-caps.

Example: small-caps preserves the original text.

<a id="textTransform"></a>
## Capitalization

Changes displayed case without rewriting the underlying text.

Default: none. Choices: none, uppercase, lowercase, capitalize.

Example: uppercase displays a label in capitals.

<a id="textDecorationLine"></a>
## Decoration lines

Combines underline, strike and overline on this state.

Default: none. Choices: none, underline, line-through, overline, underline line-through, underline overline, underline line-through overline.

Example: underline line-through shows both lines.

<a id="textDecorationStyle"></a>
## Decoration style

Controls the pattern of all active decoration lines, including double strikethrough.

Default: solid. Choices: solid, double, dotted, dashed, wavy.

Example: double with line-through creates a double strike.

<a id="textDecorationColor"></a>
## Decoration color

Colors decoration lines independently from glyphs.

Default: #202020. The adjacent typed control validates syntax and renderer support.

Example: A red underline can leave the text black.

<a id="color"></a>
## Text color

Colors glyphs on this exact target and state.

Default: #202020. The adjacent typed control validates syntax and renderer support.

Example: Choose a foreground with readable contrast.

<a id="backgroundColor"></a>
## Text highlight

Changes this element background, not a range inside its text.

Default: #ffffff. The adjacent typed control validates syntax and renderer support.

Example: A yellow background highlights the element.

<a id="letterSpacing"></a>
## Character spacing

Adds spacing between characters; negative values can overlap glyphs.

Default: 0px. The adjacent typed control validates syntax and renderer support.

Example: 1px spreads a short label.

<a id="wordSpacing"></a>
## Word spacing

Adds spacing at word separators; scripts without separators may be unaffected.

Default: 0px. The adjacent typed control validates syntax and renderer support.

Example: 4px widens English word spaces.

<a id="lineHeight"></a>
## Line height

Sets a unitless multiplier of the selected font size.

Default: 1.5. Allowed range: 0.5 to 5.

Example: 1.5 leaves half a line of additional leading.

<a id="verticalAlign"></a>
## Baseline and script

Moves an inline box; block-level targets may not respond to vertical alignment.

Default: baseline. The adjacent typed control validates syntax and renderer support.

Example: super raises a superscript without changing stored text.

<a id="direction"></a>
## Text direction

Controls inline text direction; it does not translate or reorder stored characters.

Default: ltr. Choices: ltr, rtl.

Example: rtl lays out right-to-left text.

<a id="textAlign"></a>
## Text alignment

Aligns inline content inside the target available width.

Default: start. Choices: start, end, left, right, center, justify.

Example: center centers a heading.

<a id="webkitTextStroke"></a>
## Text outline

Adds a glyph outline only where the renderer supports text stroke.

Default: 0px #202020. The adjacent typed control validates syntax and renderer support.

Example: 1px #202020 draws a thin dark outline.

<a id="textShadow"></a>
## Text shadow and glow

Adds one typed shadow; zero offsets and positive blur create a glow. Existing multiple-shadow values remain portable.

Default: none. The adjacent typed control validates syntax and renderer support.

Example: 0px 0px 8px #6750a4 creates a purple glow.


<a id="font-search"></a>
## search

Find an admitted font family or style.

Filter the current admitted inventory only; no fonts are downloaded.

Try a family name or Regular.

<a id="font-face"></a>
## face

Apply this admitted face and its default axes.

Changes family, compatible style, weight and axes through the original appearance action.

Choose a loaded local alias for an exact bundled face.

<a id="font-axis"></a>
## axis

Draft this variable axis within the face metadata bounds.

A draft alone does not change the target; Apply axis values saves the complete draft.

Use the displayed minimum, default and maximum as references.

<a id="font-apply"></a>
## apply

Apply every current axis draft to the selected admitted face.

All axes must validate together before one original appearance mutation.

A weight draft of 700 requests a heavier variable outline.

<a id="font-reset"></a>
## reset

Restore this face metadata default axis values.

Replaces axis overrides through one original appearance mutation.

Reset after an extreme width or weight experiment.

<a id="font-instance"></a>
## instance

Apply this named instance from the admitted font metadata.

The instance axis values must still pass the same face bounds and permissions.

Choose a named instance instead of entering every axis manually.
