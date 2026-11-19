// A single outlined icon family, drawn on the same 24-unit grid.
const paths = {
 encrypted: ['M4 5h16v14H4z','M8 9h8M8 13h3','M16 15v-3a2 2 0 0 0-4 0v3','M11 15h6v5h-6z'],
 drive: ['M5 4h14l2 12v4H3v-4z','M3 16h18M6 18h.01M9 18h.01'],
 offline: ['M5 3h14v18l-7-4-7 4z','m9 10 2 2 4-4'],
 settings: ['m9 3-1 3-3 1-2 3 2 2-1 3 3 3 3-1 2 2 3-1 1-3 3-1 1-3-2-2 1-3-3-3-3 1z','M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
 help: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 16h.01'],
 shield: ['m12 3 8 3v6c0 4-5 7-8 9-3-2-8-5-8-9V6z','m8 12 3 3 5-6'],
 lock: ['M6 11h12v10H6z','M8 11V7a4 4 0 0 1 8 0v4'],
 lock_open: ['M6 11h12v10H6z','M8 11V7a4 4 0 0 1 8 0'],
 cloud_upload: ['M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5a4 4 0 0 1 .5 9.5','M12 18v-6m-3 3 3-3 3 3'],
 add: ['M12 5v14M5 12h14'],
 cloud: ['M17.5 19H8a6 6 0 1 1 5.7-7.9A4.5 4.5 0 1 1 17.5 19z'],
 computer: ['M4 5h16v10H4z','M9 19h6M12 15v4'],
 info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M12 11v6M12 7h.01'],
 error: ['m12 3 10 18H2z','M12 9v5M12 17h.01'],
 open: ['M14 3h7v7M21 3l-9 9','M10 5H4v15h15v-6'],
 folder: ['M3 7V5h7l2 3h9v12H3z'],
 file: ['M5 3h9l5 5v13H5z','M14 3v6h5'],
 search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0','m15 15 6 6'],
 export: ['M12 3v12m-4-4 4 4 4-4','M5 15v6h14v-6'],
 release: ['M5 3h14v18l-7-4-7 4z','M9 10h6'],
 delete: ['M4 7h16','M9 7V4h6v3','M6 7l1 14h10l1-14','M10 11v6M14 11v6'],
 sync: ['M20 8a8 8 0 0 0-14-3L3 8','M3 3v5h5','M4 16a8 8 0 0 0 14 3l3-3','M21 21v-5h-5'],
 menu: ['M4 6h16M4 12h16M4 18h16'],
 upload: ['M12 15V3m-4 4 4-4 4 4','M5 15v6h14v-6'],
 copy: ['M9 9h11v11H9z','M5 15V4h11'],
 share: ['M21 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0','M9 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0','M21 19a3 3 0 1 1-6 0 3 3 0 0 1 6 0','m8.6 10.5 6.8-4M8.6 13.5l6.8 4'],
 history: ['M3 12a9 9 0 1 0 3-6.7L3 8','M3 3v5h5','M12 7v5l3 2'],
 link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1','M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
 panel: ['M3 5h18v14H3z','M15 5v14'],
 download: ['M12 4v11m-4-4 4 4 4-4','M5 20h14'],
 restore: ['M4 12a8 8 0 1 0 3-6.2L4 8','M4 3v5h5','M12 8v4l3 2'],
 history: ['M3 12a9 9 0 1 0 3-6.7L3 8','M3 3v5h5','M12 7v5l3 2'],
 link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1','M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
 key: ['M15 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0','M11 12l9 9','M16 17l2-2M18.5 19.5l1.5-1.5'],
 palette: ['M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4c0-4.4-4-8-9-8z','M7.5 11h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01'],
 language: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M3 12h18','M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'],
 update: ['M12 4v10m-4-3 4 4 4-4','M4 16v4h16v-4'],
 book: ['M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z','M20 4h-6','M20 4v14h-6'],
 tools: ['m14 6 4-3 3 3-3 4','M14 6 4 16l4 4 10-10','M7 14l3 3'],
 filter: ['M3 5h18l-7 8v6l-4-2v-4z'],
 sort: ['M7 4v16m-3-3 3 3 3-3','M17 20V4m-3 3 3-3 3 3'],
 image: ['M3 5h18v14H3z','M3 16l5-5 4 4 3-3 6 6','M15 9h.01'],
 play: ['M7 4v16l13-8z'],
 pause: ['M7 4v16M17 4v16'],
 stop: ['M6 6h12v12H6z'],
 cancel: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','m9 9 6 6M15 9l-6 6'],
 check: ['m5 12 5 5 9-10'],
 refresh: ['M20 11a8 8 0 1 0-2.3 5.7','M20 4v7h-7'],
 back: ['M19 12H5m6-6-6 6 6 6'],
 next: ['M5 12h14m-6-6 6 6-6 6'],
 more: ['M5 12h.01M12 12h.01M19 12h.01'],
 arrow_up: ['M12 19V5m-6 6 6-6 6 6'],
 arrow_down: ['M12 5v14m-6-6 6 6 6-6'],
 edit: ['M4 20h4L19 9l-4-4L4 16z','M13 7l4 4'],
 save: ['M5 3h11l3 3v15H5z','M8 3v6h7V3','M8 21v-7h8v7'],
 curve: ['M3 20C9 20 9 4 21 4'],
 send: ['M3 20l18-8L3 4v6l11 2-11 2z'],
 circle: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0'],
 text: ['M5 6h14M12 6v13M9 19h6'],
 minimize: ['M5 12h14'], maximize: ['M5 5h14v14H5z'], close: ['m6 6 12 12M18 6 6 18']
};
export const ICON_NAMES = Object.keys(paths);
export function icon(name) {
 const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('class','icon'); svg.setAttribute('aria-hidden','true');
 for (const d of paths[name] || paths.file) { const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',d); svg.append(path); }
 return svg;
}
export function initializeIcons() { document.querySelectorAll('[data-icon]').forEach(el => el.replaceChildren(icon(el.dataset.icon))); }
const ICON_SVG_STYLE = 'width:18px;height:18px;display:block;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round';
// Adds a leading icon to a Material Web button (light DOM or shadow DOM). The icon is re-added if a later
// label update (textContent) removes it, so translated labels keep their icon.
export function withIcon(node, name) {
 try {
  const doc = node.ownerDocument || globalThis.document;
  if (!doc || typeof doc.createElementNS !== 'function' || typeof node.prepend !== 'function') return node;
  const make = () => {
   const wrap = doc.createElement('span'); wrap.setAttribute('slot', 'icon'); wrap.setAttribute('data-icon', name);
   const svg = icon(name); svg.setAttribute('style', ICON_SVG_STYLE); wrap.append(svg); return wrap;
  };
  let host = make(); node.prepend(host);
  if (typeof MutationObserver === 'function') new MutationObserver(() => { if (host.parentNode !== node) { host = make(); node.prepend(host); } }).observe(node, { childList: true });
 } catch { /* an icon is decoration; never break the button */ }
 return node;
}

// Icon for a button label key, used by dialogs whose buttons are built from translated copy keys.
export const KEY_ICONS = {
 back: 'back', next: 'next', done: 'check', cancel: 'cancel', cancelShare: 'cancel', cancelDeploy: 'cancel', cancelRestore: 'cancel',
 change: 'edit', chooseKeyFile: 'key', keyFileInstead: 'key', usePassword: 'lock', create: 'add', createLink: 'link', addInstance: 'add',
 restore: 'restore', retry: 'refresh', refresh: 'refresh', showFolder: 'folder', unlockAndMount: 'lock_open', advancedChoose: 'folder',
 remove: 'delete', forget: 'delete', revoke: 'delete', revokeAll: 'delete', endNow: 'stop', hideLogs: 'close',
 chooseIcon: 'image', chooseBanner: 'image', actionCheck: 'check', copy: 'copy', copyLink: 'copy', copyAgain: 'copy', copyCommand: 'copy', copyCommandLine: 'copy',
 deploy: 'play', setup: 'settings', openManage: 'open', open: 'open', openList: 'open', qr: 'link', saveQr: 'download', download: 'download',
 saveAs: 'save', saveToDrive: 'drive', shareAction: 'share', webLink: 'link', receiveAnother: 'download',
 actionRestart: 'refresh', actionUpdate: 'update', actionLogs: 'history', actionStart: 'play', actionStop: 'stop', actionRemove: 'delete'
};
export function withKeyIcon(node, text, t, fallback = 'check') {
 const key = Object.keys(KEY_ICONS).find(k => { try { return t(k) === text; } catch { return false; } });
 return withIcon(node, key ? KEY_ICONS[key] : fallback);
}

// Picks a meaningful icon from an English button label, for panels that build many buttons from one factory.
const LABEL_ICONS = [
 [/unlock/i, 'lock_open'],
 [/search|find/i, 'search'], [/\bclear\b/i, 'close'], [/reset|revert|default|undo|restore/i, 'restore'], [/remove|delete|discard|forget/i, 'delete'],
 [/cancel/i, 'cancel'], [/\bstop|abort/i, 'stop'], [/pause/i, 'pause'], [/redo|\bnext\b|forward/i, 'next'], [/\bback\b|previous/i, 'back'],
 [/inspect|\bview\b|\bshow\b/i, 'search'], [/copy/i, 'copy'], [/increase|larger|bigger|raise/i, 'arrow_up'], [/decrease|smaller|lower/i, 'arrow_down'], [/register/i, 'add'], [/\badd\b|\bnew\b|create|insert|duplicate|clone/i, 'add'], [/download|install|pull/i, 'download'], [/regenerate/i, 'refresh'], [/\bsend\b/i, 'send'], [/launch|generate/i, 'play'], [/export|download/i, 'export'], [/import|upload/i, 'upload'],
 [/select/i, 'check'], [/load|choose|pick|browse|locate/i, 'folder'], [/detach|eject/i, 'close'], [/attach|mount/i, 'drive'], [/take out|drop/i, 'delete'], [/convert/i, 'sync'], [/resize/i, 'maximize'], [/compact/i, 'minimize'], [/read\b/i, 'book'], [/save|commit|store/i, 'save'], [/preview|play|start|run|try/i, 'play'],
 [/refresh|reload|retry|sync|update|check/i, 'refresh'], [/open/i, 'open'], [/colou?r|palette|theme|swatch/i, 'palette'],
 [/image|logo|picture|banner|photo|icon/i, 'image'], [/font|typeface|typography|text/i, 'edit'], [/edit|change|rename|set\b|adjust|tweak/i, 'edit'],
 [/increase|larger|bigger|raise|\bup\b|more/i, 'arrow_up'], [/decrease|smaller|lower|\bdown\b|less/i, 'arrow_down'],
 [/history|snapshot|version|schedule/i, 'history'], [/filter/i, 'filter'], [/sort|order/i, 'sort'], [/help|guide|learn/i, 'help'],
 [/lock|password|secure|protect/i, 'lock'], [/key\b/i, 'key'], [/link|share/i, 'link'], [/apply|accept|keep|confirm|done|use|ok\b|yes/i, 'check']
];
export function iconForLabel(label, fallback = 'check') {
 const text = String(label ?? '');
 for (const [pattern, name] of LABEL_ICONS) if (pattern.test(text)) return name;
 return fallback;
}
export function withLabelIcon(node, label, fallback) { return withIcon(node, iconForLabel(label, fallback)); }
