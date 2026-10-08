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
 add: ['M12 5v14M5 12h14'],
 info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0','M12 11v6M12 7h.01'],
 error: ['m12 3 10 18H2z','M12 9v5M12 17h.01'],
 open: ['M14 3h7v7M21 3l-9 9','M10 5H4v15h15v-6'],
 folder: ['M3 7V5h7l2 3h9v12H3z'],
 file: ['M5 3h9l5 5v13H5z','M14 3v6h5'],
 search: ['M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0','m15 15 6 6'],
 export: ['M12 3v12m-4-4 4 4 4-4','M5 15v6h14v-6'],
 release: ['M5 3h14v18l-7-4-7 4z','M9 10h6'],
 sync: ['M20 8a8 8 0 0 0-14-3L3 8','M3 3v5h5','M4 16a8 8 0 0 0 14 3l3-3','M21 21v-5h-5'],
 minimize: ['M5 12h14'], maximize: ['M5 5h14v14H5z'], close: ['m6 6 12 12M18 6 6 18']
};
export function icon(name) {
 const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('class','icon'); svg.setAttribute('aria-hidden','true');
 for (const d of paths[name] || paths.file) { const path = document.createElementNS(svg.namespaceURI,'path'); path.setAttribute('d',d); svg.append(path); }
 return svg;
}
export function initializeIcons() { document.querySelectorAll('[data-icon]').forEach(el => el.replaceChildren(icon(el.dataset.icon))); }
