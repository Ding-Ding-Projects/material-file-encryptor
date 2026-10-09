# Modern surfaces and clearable fields

The desktop keeps its sage appearance, with stronger navigation selection, a framed content area, grouped settings, layered welcome and drive summaries, consistent table actions and bounded dialog surfaces. Light, dark and system appearance, all three language modes and reduced motion remain supported.

Every editable text field receives a clear button, including fields inserted after startup. The button is keyboard operable, has a minimum 44 × 44 CSS px target and a localized accessible name that identifies its field. Activating it empties the value, removes custom validity, emits the same input/change events used by typing and restores focus. It never submits the form. Required fields remain required after clearing. A disabled or read-only field has a disabled clear button. A hidden field and its clear button remain hidden together.

## Field inventory

| Field | Identifier or location | Type |
| --- | --- | --- |
| File search | `file-search` | Search |
| Existing part size | `split-value` | Decimal text |
| Private repository | `remote-repository` | Text |
| Storage folder | `storage-input` | Text |
| Cache folder | `cache-input` | Text |
| Drive letter | `drive-letter` | Text combobox |
| Password | `password-input` | Password, optionally shown by existing control |
| Confirmation | `confirm-password` | Password |
| Key file path | `key-path` | Text |
| Creation part size | `create-split-value` | Decimal text |
| Custom retention | `history-days` | Number |
| History search | `history-search-host` | Dynamic search |
| Recycle search | `recycle-search-host` | Dynamic search |

The enhancement also supports future textarea, email, URL and telephone fields. No textarea exists in the current product. File pickers, checkboxes, radio controls, sliders, selects and hidden inputs are not textboxes and do not receive this control.

## Security and validation

The enhancement never copies values into accessible names, attributes, logs or preferences. Password masking and the explicit Show/Hide control remain unchanged. Clearing a path never deletes or modifies a file. Clearing retention or part size does not apply it automatically; the existing Apply or submit validation still decides whether it is valid.

## Verification boundary

`test/ui-renderer.test.js` covers keyboard clearing, all static dialog field groups, the 44 px target, focus restoration, no accidental creation, password masking, dynamic retention/search and read-only controls. It also exercises existing flows, localization, narrow layouts and reduced motion through an isolated renderer fixture. Native crypto, real drive behavior, packaged launch and built visual acceptance are separate evidence. The state inventory and required built matrix are in `design/modern-interface.md`.
