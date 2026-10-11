# Logo authoring states

The production appearance tab now contains a static-output notice, a searchable preset selector with lock and key emblems, the existing local file picker, fit/cover and focal sliders, a collapsed Crop and background section, a 64-pixel preview of the actual 128-pixel output, and Reset logo.

| State | Production target / action | Observable |
| --- | --- | --- |
| logo-original | Reset logo | Saved custom mark removed only after consumer acceptance; original title mark restored. |
| logo-preset-lock / logo-preset-key | md-outlined-select labelled Logo preset | Locally drawn geometric PNG is converted through the same path as uploaded input. |
| logo-crop | Numeric Crop left, Crop top, Crop width, Crop height | Normalized source rectangle, bounds validated before drawing. |
| logo-safe-area | Numeric Logo safe area, range 0 to 0.25 | Transparent or colored border within the actual output. |
| logo-background | Shared color workbench under Logo background | Static alpha color, notation, spectrum, swatches, local palette and reset; animated output is disabled. |
| logo-consumer-rejected | Synthetic false or rejected onChange adapter | Existing storage and accepted preview remain unchanged; error is visible. |
| logo-storage-rejected | Synthetic storage exception after display | Display is restored to the previous accepted mark; no accepted-history event. |
| logo-disposed | Destroy while conversion or application is pending | Generation checks prevent later storage mutation; shared display restoration remains explicit. |

Crop and fit settings are editing-session drafts. The normalized mark persists locally and is captured by the existing local schedule snapshot registry. Original source bytes and the draft crop recipe are not yet retained across panel recreation. Metadata-only history records successful changes; image pixels are omitted.

Current title identity consumes one 128 by 128 PNG. No installer or package icon changes are claimed. The current decoder still uses renderer createImageBitmap, with bounded input bytes and post-decode pixel checks. A dedicated bounded worker, pre-decode JPEG/WebP dimension checks, decoder round-trip validation, complete multi-target previews and persisted original authoring recipes remain open requirements. These controls do not claim those isolation guarantees.

Focused tests cover numeric geometry, zero focal coordinates, bounds, oversized-file rejection before reading, mounted admission, storage rollback and disposal. Real production captures and the full language/theme/scale matrix remain pending.
