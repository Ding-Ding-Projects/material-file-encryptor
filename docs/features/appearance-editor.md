# Element appearance editor

The renderer exposes `mountAppearanceEditor(root, services)` and stores versioned element styles under `m4e.appearance.v1`. Right-click opens element commands; Shift-right-click opens the editor directly. Shift+F10 opens the menu and Ctrl+Alt+A edits the focused element. The nonmodal editor follows its element on scrolling and resizing, bounds its size to the viewport, and returns focus on dismissal.

The host supplies `attachSearch(input, scope)` for each local search, `onLock(element, {property,state,layer})` for property locks or `onLock(element)` for an element lock, optional `translate`, `notify`, and `onChange` callbacks, and optional Storage-compatible `storage`. A missing search adapter is disclosed by a disabled field. The host must load `appearance.css`. The returned API contains `open`, `apply`, `getState`, `setState`, `reset`, and `destroy`.

## Implemented rendering and persistence

Normal, hover, focus-visible, active, selected, disabled, dragged, invalid, loading, success, warning and error states have separate ordered layers. Layers can be renamed, hidden, locked against property edits, duplicated and reordered. Later visible layers override earlier properties; pseudo-states inherit unmodified normal declarations through the cascade. The editor supplies text, spacing, dimensions, borders, shadows, filters, gradients, CSS masks, transform and motion inputs. Values are applied to the actual element using generated scoped CSS. Invalid CSS is rejected where the renderer exposes CSS.supports. URLs and declaration injection are rejected at the model boundary.

Undo and redo retain fifty in-memory snapshots. Reset works per property, layer, state, element and globally. Named presets, copy/paste style and JSON file import/export use the same bounded schema. Stable IDs use element IDs or structural paths; moving an unlabelled element can change its identity. Hosts should provide permanent `data-appearance-id` values for dynamic records. Export contains element styles only, never custom logo content.

The continuous native color spectrum is accompanied by hex input, alpha-capable HEX8, RGB/HSL readouts and alpha-composited contrast. Pure conversion helpers also expose HSV, HWB and CMYK. Animated rainbow is a structured marker accepted only for foreground and background colors. Its global speed levels 1–10 map to 55–1 seconds. CSS performs animation; reduced motion fixes the hue. No palette stores the marker as a color string.

## Local logo conversion

`mountLogoEditor` accepts static PNG, JPEG and WebP signatures, caps source bytes at 4 MiB and decoded dimensions at 8192 pixels per side and 16 million pixels, and rejects animated PNG/WebP markers. Browser image decoding and canvas generate one 128 × 128 PNG derivative. Contain/cover and numeric focal controls affect output. The prior valid image remains active on failure. Only the derivative is stored under `m4e.logo.private.v1`; reset removes it. It is deliberately separate from appearance export and history. Conversion flattens metadata and color profiles; the surface discloses this.

## Known capability and verification limits

This implementation does not meet the complete advanced-editing contract. Freehand/path selection tools, channels, groups, embedded smart objects, mesh warp, ruler/guide tools, named-color translation, append-only durable history, multi-state before/after previews, touch long-press and material-component migration remain unavailable. The editor names the advanced capability gap rather than rendering inert controls. Local layer locks prevent edits, but property authentication enforcement belongs to the host lock service and is not provided by this module. Native image decode does not supply a hard process memory or CPU-time budget, and decoded pixel limits occur after decoding. Real isolated decoder hardening remains required before claiming full adversarial-image safety.

`test/local-appearance.test.js` verifies model composition, schema round trips, unsafe-resource rejection, rainbow marker restrictions, alpha/contrast, and logo signature bounds. It is not built-runtime or screenshot evidence. Keyboard, viewport, localization, persisted reload and visual interactions require verification in the integrated application.

Installed font discovery runs only after the user activates Load installed fonts, through host listFonts() or the browser Local Font Access API. No startup permission prompt occurs. Color entry supports HEX, RGB, HSL, D65 Lab/LCH and OKLab/OKLCH with alpha; out-of-sRGB colors are rejected instead of silently clipped. Imports recursively reject unsafe prototype keys and bound element IDs, element count, layers and input length.
