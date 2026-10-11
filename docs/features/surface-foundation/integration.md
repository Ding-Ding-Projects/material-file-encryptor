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

The example intentionally names host-owned functions. It is not an executable command catalogue. Each command must invoke the same validated operation as its original control. Register `switch`, `range` (with `min` and `max`) or `text` controls with real `get` and `set` callbacks for inline palette editing. Register every host feature, setting and destination explicitly. The module cannot discover privileged actions safely.

`registerViews` accepts already-mounted view roots, preserves the active tab, and toggles registered roots when a tab activates. The host `onActivate` remains responsible for existing views. The palette invokes the same tab activation callback. `setLanguage` accepts `en`, `yue` or `bilingual`; it changes module chrome, not host content. `setProvenance` requires build-bound metadata. An absent or invalid timestamp displays unavailable instead of launch time. `destroy` removes only owned chrome and listeners.

Tabs persist under `mfe.surface.tabs.v1`, bounded to 100 open entries and 20 closed entries. Pinned tabs and the final open tab cannot close. Context actions support pinning, closing, restoration and a work group. Ctrl+W closes an eligible active tab, Ctrl+Shift+T restores one, and Ctrl+Shift+F opens the palette. The same close and restore bindings appear in the applicable context menu. A visible Tab actions button provides touch access; Shift+F10 and the Context Menu key open the menu from a tab. Tab labels and group names are persisted; do not use sensitive filenames or secret values as labels.

Every search in this module has its own adjacent expression builder, query, flags and live status. Plain-text matching is the default. Raw expressions run in a dedicated module Worker, terminated after 150 ms, with 512-character patterns, 4096-character row/sample text and 10,000 rows maximum. The workbench supports guided tokens, raw patterns, Unicode groups, replacement preview, zero-width-safe match enumeration and capture values. Invalid syntax and timeouts display an error and no results. The synchronous state model accepts a stricter safe subset and reports unsupported constructs instead of running them on the UI thread.

Notifications are bounded to 200 in-memory entries. Use `notify({title,message,level})`, where `level` is `info`, `success`, `warning` or `error`. The center filters by level, unread status and local search, supports read/unread and dismissal, and exports JSON or CSV through the host callback. Export controls are disabled if that callback is unavailable. CSV escapes fields and prefixes spreadsheet formula-leading content. Never send credentials, secret keys or other sensitive values to this API. The live region clears after eight seconds; the center retains entries for the session. The module does not claim durable notification history.

All component styles use constructed style sheets and inherited Material color properties. Reduced-motion preferences disable local transitions. The owner must set theme properties on the host/document and complete real built-renderer verification before claiming visual delivery.
