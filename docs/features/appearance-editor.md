# Element appearance editor

The renderer exposes `mountAppearanceEditor(root, services)` and stores versioned element styles under `m4e.appearance.v1`. Right-click opens element commands; Shift-right-click opens the editor directly. Shift+F10 opens the menu and Ctrl+Alt+A edits the focused element. The nonmodal editor follows its element on scrolling and resizing, bounds its size to the viewport, and returns focus on dismissal.

The host supplies `attachSearch(input, scope)` for each local search, `onLock(element, {property,state,layer})` for property locks or `onLock(element)` for an element lock, optional `translate`, `notify`, and `onChange` callbacks, and optional Storage-compatible `storage`. A missing search adapter is disclosed by a disabled field. The host must load `appearance.css`. The returned API contains `open`, `apply`, `getState`, `setState`, `reset`, and `destroy`.

The host translator accepts `translate(source, options)`, with `{message:true}` for validation and status messages. `appearance-copy.js` exports `APPEARANCE_COPY` and `APPEARANCE_COPY_KEYS`, including Cantonese copy for every owned static action, state, property label and known diagnostic. The host merges this inventory into its language service, which owns English/Cantonese/bilingual mode, independent humor controls and school mode. Dynamic user names and exact CSS values remain literal; labels around them are translated. Unexpected platform diagnostics use a known translated operation message followed by the exact original diagnostic detail. The copy coverage test scans static controls and diagnostics and verifies actual Chinese text, not identity placeholders.

## Implemented rendering and persistence

Normal, hover, focus-visible, active, selected, disabled, dragged, invalid, loading, success, warning and error states have separate ordered layers. Layers can be renamed, hidden, locked against property edits, duplicated and reordered. Later visible layers override earlier properties; pseudo-states inherit unmodified normal declarations through the cascade. The editor supplies text, spacing, dimensions, borders, shadows, filters, gradients, CSS masks, transform and motion inputs. Values are applied to the actual element using generated scoped CSS. Invalid CSS is rejected where the renderer exposes CSS.supports. URLs and declaration injection are rejected at the model boundary.

Undo and redo retain fifty in-memory snapshots. Reset works per property, layer, state, element and globally. Named presets, copy/paste style and JSON file import/export use the same bounded schema. Stable IDs use element IDs or structural paths; moving an unlabelled element can change its identity. Hosts should provide permanent `data-appearance-id` values for dynamic records. Export contains element styles only, never custom logo content.

The continuous native color spectrum is accompanied by hex input, alpha-capable HEX8, RGB/HSL readouts and alpha-composited contrast. Pure conversion helpers also expose HSV, HWB and CMYK. Animated rainbow is a structured marker accepted only for foreground and background colors. Its global speed levels 1–10 map to 55–1 seconds. CSS performs animation; reduced motion fixes the hue. No palette stores the marker as a color string.

## Layer groups, selections, and state previews

Groups organize up to four nested levels of ordered child layers. Hiding a group hides its children. Group properties apply after child properties; these are logical style groups, not independent offscreen raster surfaces. Adjustment layers carry an ordered stack of bounded blur, brightness, contrast, saturation, grayscale, sepia, inversion, hue rotation and opacity effects. Effects can be changed, removed and reordered and compose into the target's real CSS filter.

Selection tools generate actual CSS rectangle, ellipse, polygon and numeric SVG-path masks. Numeric coordinates are keyboard-accessible and bounded. RGBA channel gains use local SVG color matrices. Luminance selections generate alpha thresholds. Color-range selections retain pixels inside an axis-aligned RGB interval, with an editable center and tolerance; this is an explicit channel-range selection, not a perceptual color-distance metric. No remote filter resource is loaded.

Each state can explicitly inherit another state or no appearance state. Cycles are rejected. Before/after controls disable and restore the target's generated appearance rules without changing saved data; closing always restores the after view. Typography shortcuts apply real underline variants, double strikethrough, overline, superscript/subscript, baseline reset, small caps, outlines, glow and multiple shadows. Individual CSS property inputs remain available for precise values.

Change callbacks receive a second argument containing `kind`, target ID, state, group path and layer index. This metadata contains no image data or credentials and can bind the host's protected history record to the exact editing scope.

## Local logo conversion

`mountLogoEditor` accepts static PNG, JPEG and WebP signatures, caps source bytes at 4 MiB and decoded dimensions at 8192 pixels per side and 16 million pixels, and rejects animated PNG/WebP markers. Browser image decoding and canvas generate one 128 × 128 PNG derivative. Contain/cover and numeric focal controls affect output. The prior valid image remains active on failure. Only the derivative is stored under `m4e.logo.private.v1`; reset removes it. It is deliberately separate from appearance export and history. Conversion flattens metadata and color profiles; the surface discloses this.

## Known capability and verification limits

This implementation does not meet the complete advanced-editing contract. Freehand pointer drawing, independently rasterized group surfaces, embedded smart objects, mesh warp, ruler/guide tools, named-color translation, append-only durable history, simultaneous multi-state previews, touch long-press and material-component migration remain unavailable. The editor names the advanced capability gap rather than rendering inert controls. Local layer locks prevent edits, but property authentication enforcement belongs to the host lock service and is not provided by this module. Native image decode does not supply a hard process memory or CPU-time budget, and decoded pixel limits occur after decoding. Real isolated decoder hardening remains required before claiming full adversarial-image safety.

`test/local-appearance.test.js` verifies model composition, schema round trips, unsafe-resource rejection, rainbow marker restrictions, alpha/contrast, and logo signature bounds. It is not built-runtime or screenshot evidence. Keyboard, viewport, localization, persisted reload and visual interactions require verification in the integrated application.

Installed font discovery runs only after the user activates Load installed fonts, through host listFonts() or the browser Local Font Access API. No startup permission prompt occurs. Color entry supports HEX, RGB, HSL, D65 Lab/LCH and OKLab/OKLCH with alpha; out-of-sRGB colors are rejected instead of silently clipped. Imports recursively reject unsafe prototype keys and bound element IDs, element count, layers and input length.
