# Surface foundation integration

Import `mountSurfaceFoundation` from `src/renderer/features/shell/index.js`. All Material Web code is local, in `src/shared/surface/material.js`; there are no CDN imports, remote fonts, or runtime dependency downloads. Rebuild this checked-in vendor bundle with `node scripts/build-surface-vendor.mjs` after changing the exact dependency. The helper requires npm access to pinned esbuild 0.25.11 when it is not cached. It is not a replacement for the root build entrypoint.

```js
import {mountSurfaceFoundation} from './features/shell/index.js';
const surface = mountSurfaceFoundation({
  host: document.querySelector('main'),
  before: document.querySelector('main > section'),
  storage: localStorage,
  language: 'en',
  provenance: {version: buildMetadata.version, builtAt: buildMetadata.builtAt},
  tabs: [{id:'drive',label:'My drive',labelYue:'我的磁碟'}],
  onActivate: id => showExistingView(id),
  onExport: ({name,mime,content}) => saveUserChosenExport({name,mime,content}),
  commands: [{id:'drive:refresh',label:{en:'Refresh drive',yue:'重新整理磁碟'},run:refreshDrive}]
});
surface.registerViews([{id:'converter',label:{en:'Converter',yue:'轉換工具'},root:converterRoot}]);
surface.registerCommands([{id:'preferences:theme',label:{en:'Dark theme',yue:'深色主題'},
  control:{type:'switch',get:()=>settings.dark,set:value=>saveDarkTheme(value)}}]);
```

The example intentionally names host-owned functions. Each command must invoke the same validated operation as its original control. Register `switch`, `checkbox`, `range`, `number`, `select` or `text` controls with real `get` and `set` callbacks for inline palette editing. Numeric controls accept `min` and `max`. Select controls accept `options: [{value,label:{en,yue}}]` and open a searchable context menu with its own expression builder. Commands may include localized `description`, `group`, `keywords`, and a `reveal()` callback to focus their original setting. All of those fields and current values are searched. Register every host feature, setting and destination explicitly. The module cannot discover privileged actions safely.

`registerViews` accepts already-mounted view roots, preserves the active tab and saved closed-tab choices, and toggles registered roots when a tab activates. Newly registered destinations open by default, while a previously closed destination stays closed after reload. Selecting that destination deliberately from the palette reopens it. The host `onActivate` remains responsible for existing views. `setLanguage` accepts `en`, `yue` or `bilingual`; it changes module chrome, not host content. `setProvenance` requires build-bound metadata. An absent or invalid timestamp displays unavailable instead of launch time. `destroy` removes only owned chrome and listeners.

Tabs persist under `mfe.surface.tabs.v1`, bounded to 100 open entries, 20 undo entries and 100 saved closed destination IDs. Pinned tabs and the final open tab cannot close. Context actions support pinning, closing, restoration, movement, selection, closing other/right tabs and choosing a named group. Ctrl-click or the context action selects tabs for bulk closure. The group manager creates, renames, collapses and removes groups while keeping their tabs. Ctrl+W closes an eligible active tab, Ctrl+Shift+T restores one, and Ctrl+Shift+F opens the palette. The same close and restore bindings appear in the applicable context menu. A visible Tab actions button provides touch access; Shift+F10 and the Context Menu key open the menu from a tab. Tab labels and group names are persisted; do not use sensitive filenames or secret values as labels.

Every search in this module has its own adjacent expression builder, query, flags and live status. Plain-text matching is the default. Raw expressions run in a dedicated module Worker, terminated after 150 ms, with 512-character patterns, 4096-character row/sample text and 10,000 rows maximum. The workbench supports guided tokens, escaped literal insertion, raw patterns, Unicode groups, replacement preview, zero-width-safe match enumeration, capture values/indices, previous/next match, lexical structure and risk diagnostics. A capability matrix probes the current engine, including Unicode set operations and inline modifiers. Unsupported features remain visible. JavaScript exposes no internal parser tree or backtracking trace; lexical annotation, measured worker timing and timeout diagnostics are the available equivalent.

Users can save up to 30 snippets, explicitly opt into a 20-entry expression history, import/export snippets and copy expressions. Storage is scoped per search field, under `mfe.regex.<scope>`. Hosts should supply stable distinct `scope` attributes. Samples are never persisted. Test-case suites accept up to 50 `{text,match}` objects and show actual versus expected results. Invalid syntax and timeouts display an error and no results. The synchronous state model accepts a stricter safe subset and reports unsupported constructs instead of running them on the UI thread.

Notifications are bounded to 200 entries and persist locally with read state and dismissal. Use `notify({title,message,level})`, where `level` is `info`, `success`, `warning` or `error`. Reload sanitizes identifiers, timestamps and fields; arbitrary properties are discarded. Obvious credential assignments receive best-effort redaction, but callers must never send credentials, secret keys or sensitive values to this API. The center filters by level, unread status and local search, supports read/unread and dismissal, and exports JSON or CSV through the host callback. Export controls are disabled if that callback is unavailable. CSV escapes fields and prefixes spreadsheet formula-leading content. The live region clears after eight seconds without deleting the durable center entry. Storage refusal retains a working in-memory state but cannot guarantee persistence.

All component styles use constructed style sheets and inherited Material color properties. Reduced-motion preferences disable local transitions. The owner must set theme properties on the host/document and complete real built-renderer verification before claiming visual delivery.
