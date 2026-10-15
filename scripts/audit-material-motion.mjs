#!/usr/bin/env node
// Static Material Design 3 conformance and motion audit.
//
// Scans the browser extension (options and popup pages) and the desktop renderer for:
//   native-control      raw <button>/<input>/<select>/<textarea> that is not allowlisted
//   missing-transition  interactive selectors (hover/focus/press state or cursor:pointer) with no transition
//   missing-enter       dialogs, panels, sheets and details with no enter animation
//   missing-reduced     transitions/animations with no prefers-reduced-motion override
//   js-motion           script-driven animation with no reduced-motion check
//
// Usage: node scripts/audit-material-motion.mjs [--json]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rel = path => relative(root, path).split(sep).join('/');

// Native elements that genuinely cannot be Material Web components. Every entry needs a reason.
export const NATIVE_CONTROL_ALLOWLIST = [
  { file: 'browser-extension/options.html', tag: 'input', match: /type="file"[^>]*\bhidden\b|\bhidden\b[^>]*type="file"/, reason: 'Hidden file input: it only backs the Material button that opens the system file picker.' },
  { file: 'browser-extension/options.html', tag: 'button', match: /class="home-card"/, reason: 'Home destination cards are tab buttons rendered as Material outlined cards with a hand-built state layer (hover, focus and press opacity transitions) because Material Web has no card-button component.' }
];

const SOURCE_DIRS = ['browser-extension', 'src/renderer'];
const walk = dir => {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'vendor' || name === 'node_modules' || name === 'icons') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
};
const files = SOURCE_DIRS.flatMap(d => walk(join(root, d)));
const byExt = ext => files.filter(f => f.endsWith(ext));

// ---- CSS parsing -----------------------------------------------------------------------
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '');
const parseBlocks = (text, ctx = []) => {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) break;
    const prelude = text.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < text.length && depth) { const c = text[j++]; if (c === '{') depth++; else if (c === '}') depth--; }
    const body = text.slice(open + 1, j - 1);
    if (prelude.startsWith('@')) {
      if (/^@keyframes/i.test(prelude)) rules.push({ keyframes: prelude.replace(/^@keyframes\s+/i, '').trim(), ctx });
      else rules.push(...parseBlocks(body, [...ctx, prelude]));
    } else if (prelude) {
      rules.push({ selectors: splitSelectors(prelude), decls: parseDecls(body), ctx });
    }
    i = j;
  }
  return rules;
};
const splitSelectors = text => {
  const out = []; let depth = 0, cur = '';
  for (const c of text) {
    if ('([' .includes(c)) depth++; else if (')]'.includes(c)) depth--;
    if (c === ',' && !depth) { out.push(cur.trim()); cur = ''; } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};
const parseDecls = body => {
  const decls = {};
  let depth = 0, cur = '';
  const commit = () => { const k = cur.indexOf(':'); if (k > 0) decls[cur.slice(0, k).trim().toLowerCase()] = cur.slice(k + 1).replace(/!important/i, '').trim(); cur = ''; };
  for (const c of body) {
    if (c === '(') depth++; else if (c === ')') depth--;
    if (c === ';' && !depth) commit(); else cur += c;
  }
  commit();
  return decls;
};
const isReduced = rule => rule.ctx.some(c => /prefers-reduced-motion\s*:\s*reduce/i.test(c));
const normalize = s => s.replace(/\s*([>+~])\s*/g, '$1').replace(/\s+/g, ' ').replace(/"/g, '').trim();
const STATE_PSEUDO = /:(hover|active|focus-visible|focus-within|focus|checked|disabled)\b/g;
const stateBase = s => normalize(s.replace(/:not\(\s*:(hover|active|focus-visible|focus-within|focus|checked|disabled)\s*\)/g, '').replace(/:has\([^)]*\)/g, '').replace(/:not\(\[hidden\]\)/g, '').replace(STATE_PSEUDO, ''));
const hasMotion = d => {
  const t = d.transition || '', a = d.animation || '', tp = d['transition-property'] || '', an = d['animation-name'] || '';
  const trans = (t && !/^none\b|^0s\b|^0ms\b/.test(t)) || (tp && !/^none$/.test(tp));
  const anim = (a && !/^none\b/.test(a)) || (an && !/^none$/.test(an));
  return trans || anim;
};
const hasTransition = d => {
  const t = d.transition || '', tp = d['transition-property'] || '';
  return (t && !/^none\b|^0s\b|^0ms\b/.test(t)) || (tp && !/^none$/.test(tp));
};
const hasAnimation = d => {
  const a = d.animation || '', an = d['animation-name'] || '';
  return (a && !/^none\b/.test(a)) || (an && !/^none$/.test(an));
};
const killsMotion = d => {
  const a = d.animation || d['animation-name'] || '', t = d.transition || d['transition-duration'] || d['transition-property'] || '';
  return /^none\b|^0|^\.01ms/.test(a.trim()) || /^none\b|^0|^\.01ms/.test(t.trim());
};

const cssCache = new Map();
const cssRules = file => {
  if (!cssCache.has(file)) cssCache.set(file, parseBlocks(stripComments(readFileSync(file, 'utf8'))));
  return cssCache.get(file);
};

// ---- Page groups: each HTML page with the stylesheets it links ----------------------------
const pages = byExt('.html').map(html => {
  const text = readFileSync(html, 'utf8');
  const css = [...text.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)].map(m => resolve(dirname(html), m[1])).filter(existsSync);
  const scripts = [...text.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => resolve(dirname(html), m[1])).filter(existsSync);
  return { html, text, css, scripts };
});
// Feature stylesheets that no page links directly are attached to the main renderer page.
const mainRenderer = pages.find(p => rel(p.html) === 'src/renderer/index.html');
const linked = new Set(pages.flatMap(p => p.css));
for (const css of byExt('.css')) if (!linked.has(css) && mainRenderer && rel(css).startsWith('src/renderer/')) mainRenderer.css.push(css);

const findings = [];
const findingKeys = new Set();
const add = (rule, file, detail) => { const key = rule + '|' + rel(file) + '|' + detail; if (findingKeys.has(key)) return; findingKeys.add(key); findings.push({ rule, file: rel(file), detail }); };

// ---- (a) native controls --------------------------------------------------------------------
const NATIVE = /<(button|input|select|textarea)(?=[\s>\/])[^>]*>/gi;
const allowed = (file, tag, markup) => NATIVE_CONTROL_ALLOWLIST.find(a => a.file === rel(file) && a.tag === tag && a.match.test(markup));
for (const file of [...byExt('.html'), ...byExt('.js')]) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(NATIVE)) {
    if (/type=["']hidden["']/.test(m[0])) continue;
    if (!allowed(file, m[1].toLowerCase(), m[0])) add('native-control', file, m[0].slice(0, 120));
  }
  for (const m of text.matchAll(/createElement\(\s*['"](button|input|select|textarea)['"]\s*\)/g)) add('native-control', file, m[0]);
}

// ---- (b) interactive selectors without a transition -------------------------------------------
const isMaterialHost = base => /(^|[\s>+~])(md|mfe)-[a-z-]+(?=[\s.#\[:>+~]|$)[^\s>+~]*$/.test(base);
const lastCompound = base => base.split(/[\s>+~]+/).pop();
const prefixTokens = base => base.split(/[\s>+~]+/).slice(0, -1);
const leadingTag = compound => (/^[a-z][a-z0-9-]*/i.exec(compound) || [''])[0];
// A transition rule T covers a state selector B when both end in the same element (or T names only the
// element type) and every ancestor token of T also appears, in order, among B's ancestors.
const covers = (t, base) => {
  const tl = lastCompound(t), bl = lastCompound(base);
  if (tl !== bl && !(/^[a-z][a-z0-9-]*$/i.test(tl) && tl === leadingTag(bl))) return false;
  const have = prefixTokens(base); let at = 0;
  for (const tok of prefixTokens(t)) { const k = have.indexOf(tok, at); if (k < 0) return false; at = k + 1; }
  return true;
};
for (const page of pages) {
  const sheetRules = page.css.flatMap(cssRules).filter(r => r.selectors);
  const transitioned = new Set(sheetRules.filter(r => hasTransition(r.decls) && !isReduced(r)).flatMap(r => r.selectors.map(stateBase)));
  const seen = new Set();
  for (const css of page.css) for (const r of cssRules(css)) {
    if (!r.selectors || isReduced(r)) continue;
    for (const sel of r.selectors) {
      const interactive = STATE_PSEUDO.test(sel) || r.decls.cursor === 'pointer';
      STATE_PSEUDO.lastIndex = 0;
      if (!interactive) continue;
      const base = stateBase(sel);
      if (!base || base === '*' || /^(html|body|:root)\b/.test(base) && !/\s/.test(base)) continue;
      if (/::(-webkit-|part|picker|checkmark|placeholder|selection|-moz)/.test(base) || /::-webkit/.test(base)) continue;
      const tail = lastCompound(base);
      if (/^(md|mfe)-/.test(tail) && !/::/.test(tail)) continue; // Material hosts carry their own state layer
      if (/\[(disabled|aria-disabled)/.test(sel) && !/:hover|:active/.test(sel)) continue;
      const key = rel(css) + '|' + base;
      if (seen.has(key)) continue; seen.add(key);
      // Accept a transition on the base, on a descendant state layer, or on the parent for child targets.
      const ok = transitioned.has(base) || [...transitioned].some(t => t.startsWith(base + '::') || t.startsWith(base + ' ') || t.startsWith(base + '>') || covers(t, base));
      if (!ok) add('missing-transition', css, `${base}`);
    }
  }

  // ---- (b2) enter animation for dialogs, panels, sheets and disclosure --------------------------
  const hasAnimFor = pat => sheetRules.some(r => !isReduced(r) && hasAnimation(r.decls) && r.selectors.some(s => pat.test(s)));
  const surfaces = [
    { name: 'tab panel', html: /role=["']tabpanel["']/, css: /tabpanel/ },
    { name: 'dialog', html: /role=["']dialog["']|<dialog\b/, css: /dialog|side-sheet/ },
    { name: 'side sheet', html: /class=["'][^"']*side-sheet/, css: /side-sheet/ },
    { name: 'disclosure', html: /<details\b/, css: /details/ },
    { name: 'status message', html: /role=["'](status|alert)["']/, css: /status|alert|snackbar|toast|notification/ }
  ];
  const pageText = page.text;
  const dynamic = page.scripts.map(s => readFileSync(s, 'utf8')).join('\n');
  for (const s of surfaces) {
    if (!s.html.test(pageText) && !s.html.test(dynamic)) continue;
    // md-dialog and md-menu ship their own enter/exit motion.
    if (s.name === 'dialog' && /<md-dialog\b/.test(pageText) && !/role=["']dialog["']/.test(pageText)) continue;
    if (!hasAnimFor(s.css)) add('missing-enter', page.html, `${s.name}: no enter animation in linked stylesheets`);
  }

  // ---- (c) reduced-motion coverage --------------------------------------------------------------------
  const reducedRules = sheetRules.filter(isReduced);
  const globalKill = reducedRules.some(r => r.selectors.some(s => s.trim() === '*') && killsMotion(r.decls));
  if (!globalKill) {
    const covered = new Set(reducedRules.filter(r => killsMotion(r.decls)).flatMap(r => r.selectors.map(stateBase)));
    const coveredLoose = [...covered];
    const seenM = new Set();
    for (const css of page.css) for (const r of cssRules(css)) {
      if (!r.selectors || isReduced(r) || !hasMotion(r.decls)) continue;
      for (const sel of r.selectors) {
        const base = stateBase(sel);
        const key = rel(css) + '|' + base;
        if (seenM.has(key)) continue; seenM.add(key);
        if (covered.has(base) || coveredLoose.some(c => base.startsWith(c + ' ') && false)) continue;
        // A rule using a vendor part (slider thumb, scrollbar) may be covered by a pseudo-element override.
        const stripped = base.replace(/::[\w-]+(\([^)]*\))?/g, '');
        if (covered.has(stripped) || [...covered].some(c => c.replace(/::[\w-]+(\([^)]*\))?/g, '') === stripped)) continue;
        add('missing-reduced', css, base);
      }
    }
  }
}

// ---- (e) raw easing curves: transitions and animations must use the shared motion tokens ----------
for (const css of byExt('.css')) {
  for (const r of cssRules(css)) {
    if (!r.decls) continue;
    for (const prop of ['transition', 'animation']) {
      const value = (r.decls[prop] || '').replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, '');
      if (/cubic-bezier\(/.test(value) || /\b(ease|ease-in|ease-out|ease-in-out)\b/.test(value)) add('raw-easing', css, `${r.selectors.join(', ').slice(0, 80)} uses a literal ${prop} curve`);
    }
  }
}

// ---- (d) script-driven motion ------------------------------------------------------------------
const JS_MOTION = /\.animate\(|\.style\.(transition|animation)\b|behavior:\s*['"]smooth['"]/;
for (const file of byExt('.js')) {
  const text = readFileSync(file, 'utf8');
  if (JS_MOTION.test(text) && !/prefers-reduced-motion|reducedMotion|reduced-stimulus|reduceMotion/i.test(text)) add('js-motion', file, 'script animation without a reduced-motion check');
}

export const runAudit = () => ({
  findings: findings.map(f => ({ ...f })),
  allowlist: NATIVE_CONTROL_ALLOWLIST.map(({ file, tag, reason }) => ({ file, tag, reason })),
  scanned: files.length
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runAudit();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    const counts = {};
    for (const f of result.findings) { counts[f.rule] = (counts[f.rule] || 0) + 1; console.log(`${f.rule}\t${f.file}\t${f.detail}`); }
    console.log(`\nscanned ${result.scanned} files; ${result.findings.length} finding(s)`, JSON.stringify(counts));
  }
  process.exitCode = result.findings.length ? 1 : 0;
}
