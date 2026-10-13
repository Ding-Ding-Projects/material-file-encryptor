# Main-branch clear control anatomy

Base source: `4c2a6540cd6789e1042b600b6a283354ec8e8e71`.

This bounded design changes only the clear action attached to existing native input and textarea fields. It does not convert the surrounding form, add select search, or complete the wider Material Design 3 migration. The original input node, label association, name, validation, form ancestry, value events and focus return remain intact inside the existing wrapper.

The action uses the already imported `@material/web/iconbutton/icon-button.js`. Its local SVG has a 24 × 24 view box, `currentColor` fill, `aria-hidden=true` and `focusable=false`. The host is 40 × 40 CSS pixels with the component's existing 48 × 48 touch region. Positioning at top/right 4 px keeps the touch region within a normal 48 px field. State layers, keyboard activation, focus ring and disabled presentation stay owned by the registered component; application CSS does not style its shadow internals.

`reference.svg` is a static dimension illustration, not a screenshot or runtime proof. The 24/40/48 dimensions previously observed on source `49fe7b4ce817f7006a42172bdfbb9bccfddb4df7` are design intent here only. Those historical captures do not verify this main-branch implementation.

## Behavior and acceptance

- Clear emits one bubbling `input` event followed by one bubbling `change`, clears custom validity and returns focus without scrolling. It is never a submit action.
- Disabled and read-only fields reject activation, including activation before the observer refreshes the helper.
- Accessible names use the existing translated “Clear field” text plus the explicit field label. Values never enter the name or tooltip. Language refresh updates names.
- Hidden or ineligible input types hide the wrapper as before. Textareas and eligible dynamically added fields use the same enhancement.
- Main still contains native form controls. Select-search composition and the larger interface conversion remain unfinished.

The focused Node checks prove source structure and callback behavior only. Fresh built evidence must verify computed icon/host/touch dimensions, all touch-edge hit points, keyboard activation and focus, form submission isolation, disabled/read-only states, English/Cantonese/bilingual labels, light/dark themes, normal/minimum viewports and 100/125/150/200 percent scales. No current built capture or full visual acceptance is claimed.

See [the Cantonese explanation](README.zh-HK.md) and [the state inventory](inventory.json).
