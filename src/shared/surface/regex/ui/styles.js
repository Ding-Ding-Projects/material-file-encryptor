// Styles for the builder, injected into the search element's shadow root. Highlighting never relies
// on colour alone: the selected match is also outlined, and groups are underlined with distinct
// patterns, and the tables beside them spell out the same information in text.
export const builderCss = `
.builder h4{margin:12px 0 4px} .builder h5{margin:8px 0 4px}
.builder .tabpanel{padding-block:8px}
.builder md-tabs{overflow-x:auto;max-width:100%}
.token-row{display:grid;grid-template-columns:minmax(150px,max-content) 1fr;gap:8px;align-items:center}
@media(max-width:560px){.token-row{grid-template-columns:1fr}}
.code,.hl{margin:0;padding:8px 10px;border-radius:8px;background:var(--md-sys-color-surface-container-highest,#e1e2e8);font:13px/1.5 var(--mfe-mono,ui-monospace,Consolas,monospace);white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}
.hl mark{color:inherit;border-radius:3px}
.hl mark.m0{background:color-mix(in srgb,var(--md-sys-color-primary,#5466a8) 30%,transparent)}
.hl mark.m1{background:color-mix(in srgb,var(--md-sys-color-tertiary,#7a5470) 30%,transparent)}
.hl mark.sel{outline:2px solid var(--md-sys-color-primary,#5466a8);outline-offset:0}
.hl mark.fail{background:color-mix(in srgb,var(--md-sys-color-error,#ba1a1a) 28%,transparent);outline:2px dashed var(--md-sys-color-error,#ba1a1a)}
.hl mark.g1{text-decoration:underline solid 2px} .hl mark.g2{text-decoration:underline dashed 2px} .hl mark.g3{text-decoration:underline dotted 2px}
.hl mark.g4{text-decoration:underline double 2px} .hl mark.g5{text-decoration:underline wavy 1px} .hl mark.g0{text-decoration:underline overline 1px}
.tree{display:grid;gap:2px;max-height:260px;overflow:auto}
.tree-node{box-sizing:border-box;display:block;cursor:pointer;padding-block:6px;padding-inline-end:8px;border-radius:6px;min-height:32px}
.tree-node:hover{background:color-mix(in srgb,var(--md-sys-color-on-surface,#202124) 8%,transparent)}
.tree-node:focus-visible{outline:3px solid var(--md-sys-color-primary,#5466a8);outline-offset:-2px}
.tree-node.current{background:color-mix(in srgb,var(--md-sys-color-primary,#5466a8) 18%,transparent)}
.tree-node code{font-family:var(--mfe-mono,ui-monospace,Consolas,monospace)}
.group-row{margin:0;font-family:var(--mfe-mono,ui-monospace,Consolas,monospace);font-size:13px;overflow-wrap:anywhere}
.alert{color:var(--md-sys-color-error,#ba1a1a)} .notice{padding:8px 10px;border-radius:8px;background:var(--md-sys-color-secondary-container,#dde1ff);margin:0}
.flavor-card{padding:8px 10px;border:1px solid var(--md-sys-color-outline-variant,#c4c6d0);border-radius:12px}
.pieces{margin:0;padding-inline-start:24px;overflow-wrap:anywhere}
.flag-row{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:center;min-height:48px}
`;
