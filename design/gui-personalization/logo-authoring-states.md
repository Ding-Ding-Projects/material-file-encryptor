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

The accepted original input (at most 4 MiB), validated crop/fit/focal/background/preset recipe, and normalized output persist in a private versioned authoring record bounded to 8 MiB. Reopening restores the source and controls without another file selection. The compatibility output key remains available to existing title consumers. Updates retain the mounted editor’s accepted pair before conversion, reject newer writes before publication or reset, read back both intended records, and roll back only attempted owned writes on failure; conflicting concurrent values are retained and recovery becomes explicit. Reset removes source, recipe and output. Legacy normalized-only logos remain editable with a visible original-source-unavailable notice. Metadata-only history and exports omit original pixels, recipes containing image data and converted pixels.

Current title identity consumes one 128 by 128 PNG. No installer or package icon changes are claimed. Decoding and conversion now run in a dedicated module worker, with no ambient fetch/WebSocket interfaces, one active job, a ten-second deadline, and termination on completion, cancellation or failure. PNG/JPEG/WebP dimensions are checked before decoding; the normalized PNG is decoded again before acceptance. This is a worker boundary, not a separate operating-system process. The current application has exactly one logo consumer: .window-brand img[data-custom-logo], 20 by 20 pixels on the titlebar --frame background. A labelled preview follows its effective scheduled image; separate 64- and 128-pixel editing previews show the saved base. No taskbar or package consumer exists. Actual production worker execution, pixel parity and the complete matrix remain pending built runtime checks.

Focused tests cover numeric geometry, zero focal coordinates, bounds, oversized-file rejection before reading, mounted admission, storage rollback, disposal, pre-decode dimension admission and worker termination on success, malformed output, timeout and cancellation. Real production captures and the full language/theme/scale matrix remain pending.

Additional states: logo-reopened-recipe restores all accepted authoring fields and original bytes; logo-title-preview follows scheduled output independently of the saved-base editing views. Original bytes and image-bearing records must never enter public capture evidence; acceptance uses synthetic sources only.
