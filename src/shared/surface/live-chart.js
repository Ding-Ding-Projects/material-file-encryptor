// Reusable live line chart (SVG). Eases between updates, pulses a live dot, supports pointer and keyboard scrubbing,
// and always offers an accessible data table. Nothing is invented: with no points it shows an honest empty state.
import { niceRange, scaleLinear, downsample, ease, nearestIndex } from '../toolbox/chart-scale.js';
import { reducedMotionRequested } from './reduced-motion.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = 640, H = 220, PAD = { left: 52, right: 56, top: 14, bottom: 26 };
const STATES = {
  loading: ['Loading data…', '資料載入中…'],
  empty: ['No data yet. Points appear here as they arrive.', '暫時未有資料。有新資料時會顯示喺度。'],
  paused: ['Paused. Showing the last values received.', '已暫停。顯示最後收到嘅數值。'],
  stale: ['No new data for a while. Showing the last values received.', '一段時間冇新資料。顯示最後收到嘅數值。'],
};
const vis = (node, shown) => node.setAttribute('visibility', shown ? 'visible' : 'hidden');
const svg = (name, attrs = {}) => { const node = document.createElementNS(SVG, name); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; };

export function createLiveChart(host, { title, unit = '', format = v => String(v), getLanguage = () => 'en', maxPoints = 300, staleAfterMs = 30000, now = () => Date.now(), copy = {} } = {}) {
  const tr = (en, yue) => { const lang = getLanguage(); return lang === 'yue' ? yue : lang === 'bilingual' ? `${en} · ${yue}` : en; };
  const labelOf = value => typeof value === 'string' ? value : tr(value.en, value.yue);
  const root = document.createElement('figure'); root.className = 'live-chart';
  const caption = document.createElement('figcaption'); caption.className = 'live-chart-title';
  const stage = document.createElement('div'); stage.className = 'live-chart-stage';
  const canvas = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: '0', preserveAspectRatio: 'none' });
  const gradientId = `lc-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svg('defs'); const gradient = svg('linearGradient', { id: gradientId, x1: '0', y1: '0', x2: '0', y2: '1' });
  gradient.append(svg('stop', { offset: '0', 'stop-color': 'currentColor', 'stop-opacity': '0.28' }), svg('stop', { offset: '1', 'stop-color': 'currentColor', 'stop-opacity': '0' }));
  defs.append(gradient);
  const grid = svg('g', { class: 'live-chart-grid' });
  const area = svg('path', { fill: `url(#${gradientId})`, stroke: 'none' });
  const line = svg('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  const dot = svg('circle', { r: '4', fill: 'currentColor', class: 'live-chart-dot', visibility: 'hidden' });
  const halo = svg('circle', { r: '4', fill: 'currentColor', class: 'live-chart-halo', visibility: 'hidden' });
  const cross = svg('line', { class: 'live-chart-cross', y1: PAD.top, y2: H - PAD.bottom, visibility: 'hidden' });
  canvas.append(defs, grid, area, line, halo, dot, cross);
  const badge = document.createElement('div'); badge.className = 'live-chart-badge'; badge.hidden = true;
  const tip = document.createElement('div'); tip.className = 'live-chart-tip'; tip.hidden = true;
  const overlay = document.createElement('p'); overlay.className = 'live-chart-state'; overlay.setAttribute('role', 'status');
  const summary = document.createElement('p'); summary.className = 'live-chart-summary';
  const details = document.createElement('details'); details.className = 'live-chart-table';
  const detailsTitle = document.createElement('summary'); const table = document.createElement('table');
  details.append(detailsTitle, table);
  stage.append(canvas, badge, tip, overlay);
  root.append(caption, stage, summary, details);
  host.append(root);

  let points = [], mode = 'live', shown = { min: 0, max: 1, last: NaN }, target = { min: 0, max: 1, last: NaN }, raf = 0, last = performance.now(), scrub = -1, destroyed = false, lastArrival = 0;
  const reduced = () => reducedMotionRequested(document);
  const timeFmt = t => new Date(t).toLocaleTimeString(getLanguage() === 'yue' ? 'zh-HK' : undefined);

  function stateKey() {
    if (mode === 'loading') return 'loading';
    if (!points.length) return 'empty';
    if (mode === 'paused') return 'paused';
    if (now() - lastArrival > staleAfterMs) return 'stale';
    return null;
  }
  function retarget() {
    const values = points.map(p => p.value);
    const range = niceRange(Math.min(...values), Math.max(...values), 3);
    target = { min: range.min, max: range.max, last: values.at(-1) ?? NaN, ticks: range.ticks };
  }
  function draw() {
    const view = downsample(points, 240);
    const x = scaleLinear(view[0]?.time ?? 0, view.at(-1)?.time ?? 1, PAD.left, W - PAD.right);
    const y = scaleLinear(shown.min, shown.max, H - PAD.bottom, PAD.top);
    grid.replaceChildren();
    for (const tick of target.ticks || []) {
      const ty = y(tick);
      if (ty < PAD.top - 1 || ty > H - PAD.bottom + 1) continue;
      const g = svg('line', { x1: PAD.left, x2: W - PAD.right, y1: ty, y2: ty, class: 'live-chart-gridline' });
      const text = svg('text', { x: PAD.left - 6, y: ty + 4, 'text-anchor': 'end', class: 'live-chart-tick' }); text.textContent = format(tick);
      grid.append(g, text);
    }
    if (!view.length) { line.setAttribute('d', ''); area.setAttribute('d', ''); vis(dot, false); vis(halo, false); badge.hidden = true; return; }
    const pts = view.map(p => [x(p.time), y(p.value)]);
    if (Number.isFinite(shown.last)) pts[pts.length - 1][1] = y(shown.last);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
    line.setAttribute('d', d);
    area.setAttribute('d', `${d}L${pts.at(-1)[0].toFixed(1)},${H - PAD.bottom}L${pts[0][0].toFixed(1)},${H - PAD.bottom}Z`);
    const [lx, ly] = pts.at(-1);
    for (const node of [dot, halo]) { vis(node, true); node.setAttribute('cx', lx); node.setAttribute('cy', ly); }
    const live = !stateKey() && !reduced();
    halo.classList.toggle('pulsing', live);
    badge.hidden = false; badge.textContent = format(Number.isFinite(shown.last) ? shown.last : view.at(-1).value) + (unit ? ` ${unit}` : '');
    badge.style.top = `${(ly / H) * 100}%`;
    if (scrub >= 0 && points[scrub]) {
      const p = points[scrub], px = x(p.time);
      vis(cross, true); cross.setAttribute('x1', px); cross.setAttribute('x2', px);
      tip.hidden = false; tip.textContent = `${timeFmt(p.time)}  ${format(p.value)}${unit ? ` ${unit}` : ''}`;
      tip.style.left = `${Math.min(80, Math.max(2, (px / W) * 100))}%`;
    } else { vis(cross, false); tip.hidden = true; }
  }
  function frame(time) {
    raf = 0; if (destroyed) return;
    const dt = time - last; last = time;
    const snap = reduced();
    shown.min = ease(shown.min, target.min, dt, { reduced: snap }); shown.max = ease(shown.max, target.max, dt, { reduced: snap }); shown.last = ease(shown.last, target.last, dt, { reduced: snap });
    draw();
    if (shown.min !== target.min || shown.max !== target.max || shown.last !== target.last) raf = requestAnimationFrame(frame);
  }
  const schedule = () => { if (!raf && !destroyed) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  function describe() {
    const key = stateKey();
    overlay.textContent = key ? labelOf({ en: copy[key]?.en || STATES[key][0], yue: copy[key]?.yue || STATES[key][1] }) : '';
    overlay.hidden = !key;
    caption.textContent = labelOf(title);
    detailsTitle.textContent = tr('Show data as a table', '以表格顯示資料');
    if (!points.length) { summary.textContent = ''; canvas.setAttribute('aria-label', `${labelOf(title)}. ${overlay.textContent}`); table.replaceChildren(); return; }
    const values = points.map(p => p.value);
    const text = `${tr('Latest', '最新')} ${format(values.at(-1))}${unit ? ` ${unit}` : ''}, ${tr('low', '最低')} ${format(Math.min(...values))}, ${tr('high', '最高')} ${format(Math.max(...values))}, ${points.length} ${tr('points', '個數據點')}.`;
    summary.textContent = text;
    canvas.setAttribute('aria-label', `${labelOf(title)}. ${text} ${tr('Use left and right arrow keys to inspect values.', '用左右方向鍵檢視數值。')}`);
  }
  function renderTable() {
    if (!details.open) return;
    const head = document.createElement('thead'); const hr = document.createElement('tr');
    for (const h of [tr('Time', '時間'), `${labelOf(title)}${unit ? ` (${unit})` : ''}`]) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = h; hr.append(th); }
    head.append(hr); const body = document.createElement('tbody');
    for (const p of points.slice(-200).reverse()) { const tr1 = document.createElement('tr'); const a = document.createElement('td'); a.textContent = timeFmt(p.time); const b = document.createElement('td'); b.textContent = format(p.value); tr1.append(a, b); body.append(tr1); }
    table.replaceChildren(head, body);
  }
  details.addEventListener('toggle', renderTable);
  function pointerScrub(event) {
    const rect = canvas.getBoundingClientRect(); if (!rect.width || !points.length) return;
    const view = points; const x0 = view[0].time, x1 = view.at(-1).time;
    const px = ((event.clientX - rect.left) / rect.width) * W;
    scrub = nearestIndex(points, x0 + ((px - PAD.left) / (W - PAD.left - PAD.right)) * (x1 - x0)); draw();
  }
  canvas.addEventListener('pointermove', pointerScrub);
  canvas.addEventListener('pointerleave', () => { scrub = -1; draw(); });
  canvas.addEventListener('keydown', event => {
    if (!points.length) return;
    if (event.key === 'ArrowLeft') scrub = Math.max(0, (scrub < 0 ? points.length : scrub) - 1);
    else if (event.key === 'ArrowRight') scrub = Math.min(points.length - 1, scrub + 1);
    else if (event.key === 'Home') scrub = 0; else if (event.key === 'End') scrub = points.length - 1;
    else if (event.key === 'Escape') scrub = -1; else return;
    event.preventDefault(); draw();
  });
  const staleTimer = setInterval(() => { if (!destroyed) describe(); }, 5000);

  let drawn = false;
  function drawIn() {
    if (drawn || !points.length) return; drawn = true;
    if (reduced() || !line.animate) return;
    line.setAttribute('pathLength', '1'); line.style.strokeDasharray = '1';
    line.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, easing: 'cubic-bezier(.2,0,0,1)' }).finished.finally(() => { line.style.strokeDasharray = ''; line.removeAttribute('pathLength'); }).catch(() => {});
  }
  const api = {
    push(time, value) {
      if (!Number.isFinite(time) || !Number.isFinite(value)) return;
      if (points.length && time <= points.at(-1).time) time = points.at(-1).time + 1;
      points.push({ time, value }); if (points.length > maxPoints) points.shift();
      lastArrival = now(); retarget(); describe(); renderTable();
      if (!Number.isFinite(shown.last)) shown = { ...target, last: target.last };
      schedule(); drawIn();
    },
    setPoints(next) { points = next.filter(p => Number.isFinite(p.time) && Number.isFinite(p.value)).slice(-maxPoints); lastArrival = points.length ? now() : 0; if (points.length) retarget(); else target = { min: 0, max: 1, last: NaN, ticks: [] }; describe(); renderTable(); if (!points.length) draw(); schedule(); drawIn(); },
    setMode(next) { mode = next; describe(); },
    refreshLanguage() { describe(); renderTable(); },
    get count() { return points.length; },
    destroy() { destroyed = true; clearInterval(staleTimer); if (raf) cancelAnimationFrame(raf); root.remove(); },
  };
  describe(); draw();
  return api;
}

