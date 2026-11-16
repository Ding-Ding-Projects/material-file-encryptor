// Pure scaling helpers for the live chart. No DOM access, so they can be tested directly.

/** Round range to "nice" tick values. Always returns min < max, even for flat data. */
export function niceRange(min, max, ticks = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
  const rough = (max - min) / Math.max(1, ticks);
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const values = [];
  for (let v = lo; v <= hi + step / 2; v += step) values.push(Number(v.toPrecision(12)));
  return { min: lo, max: hi, step, ticks: values };
}

export function scaleLinear(domainMin, domainMax, rangeMin, rangeMax) {
  const span = domainMax - domainMin;
  return value => span === 0 ? (rangeMin + rangeMax) / 2 : rangeMin + ((value - domainMin) / span) * (rangeMax - rangeMin);
}

/** Keep at most `limit` points, preserving first and last and the extremes of each bucket. */
export function downsample(points, limit) {
  if (points.length <= limit || limit < 4) return points.slice();
  const bucket = (points.length - 2) / ((limit - 2) / 2);
  const out = [points[0]];
  for (let start = 1; start < points.length - 1; start += bucket) {
    const slice = points.slice(Math.floor(start), Math.min(points.length - 1, Math.floor(start + bucket)));
    if (!slice.length) continue;
    let lowest = slice[0], highest = slice[0];
    for (const p of slice) { if (p.value < lowest.value) lowest = p; if (p.value > highest.value) highest = p; }
    out.push(...(lowest.time <= highest.time ? [lowest, highest] : [highest, lowest]));
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Move the displayed value toward the target. `reduced` snaps immediately. */
export function ease(current, target, deltaMs, { reduced = false, halfLifeMs = 120 } = {}) {
  if (reduced || !Number.isFinite(current)) return target;
  const k = 1 - 0.5 ** (Math.max(0, deltaMs) / halfLifeMs);
  const next = current + (target - current) * k;
  return Math.abs(target - next) < Math.abs(target) * 1e-4 + 1e-9 ? target : next;
}

/** Index of the point closest in time to `time`, or -1 for no points. */
export function nearestIndex(points, time) {
  if (!points.length) return -1;
  let low = 0, high = points.length - 1;
  while (low < high) { const mid = (low + high) >> 1; if (points[mid].time < time) low = mid + 1; else high = mid; }
  if (low > 0 && Math.abs(points[low - 1].time - time) <= Math.abs(points[low].time - time)) return low - 1;
  return low;
}

export function formatBytes(value) {
  if (!Number.isFinite(value)) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = Math.abs(value), i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${value < 0 ? '-' : ''}${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}
