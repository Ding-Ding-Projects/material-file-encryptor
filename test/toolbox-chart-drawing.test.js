import test from 'node:test';
import assert from 'node:assert/strict';
import { niceRange, scaleLinear, downsample, ease, nearestIndex, formatBytes } from '../src/shared/toolbox/chart-scale.js';
import { createHistory, restoreHistory, toSvg, constrainPoint, normalizeShape } from '../src/shared/toolbox/drawing-history.js';

test('niceRange widens flat and ordinary data', () => {
  const flat = niceRange(5, 5);
  assert.ok(flat.min < 5 && flat.max > 5);
  const r = niceRange(3, 97);
  assert.equal(r.min, 0); assert.equal(r.max, 100); assert.ok(r.ticks.includes(50));
  assert.equal(niceRange(NaN, 1).max, 1);
});
test('scaleLinear maps and tolerates a zero span', () => {
  const s = scaleLinear(0, 10, 100, 200);
  assert.equal(s(5), 150);
  assert.equal(scaleLinear(3, 3, 0, 10)(3), 5);
});
test('downsample keeps ends and extremes and never invents points', () => {
  const points = Array.from({ length: 1000 }, (_, i) => ({ time: i, value: i === 500 ? 9999 : i % 7 }));
  const out = downsample(points, 60);
  assert.ok(out.length <= 70);
  assert.equal(out[0], points[0]); assert.equal(out.at(-1), points.at(-1));
  assert.ok(out.some(p => p.value === 9999));
  assert.ok(out.every(p => points.includes(p)));
  assert.equal(downsample(points.slice(0, 5), 60).length, 5);
});
test('ease snaps under reduced motion and converges otherwise', () => {
  assert.equal(ease(0, 10, 16, { reduced: true }), 10);
  let v = 0; for (let i = 0; i < 200; i++) v = ease(v, 10, 16);
  assert.equal(v, 10);
  assert.ok(ease(0, 10, 16) < 10);
});
test('nearestIndex and formatBytes', () => {
  const pts = [{ time: 0 }, { time: 10 }, { time: 20 }];
  assert.equal(nearestIndex(pts, 12), 1); assert.equal(nearestIndex(pts, 99), 2); assert.equal(nearestIndex([], 1), -1);
  assert.equal(formatBytes(1536), '1.5 KB'); assert.equal(formatBytes(0), '0 B');
});

test('drawing history undo, redo and redo invalidation', () => {
  const h = createHistory();
  h.add({ tool: 'pen', color: '#ff0000', width: 4, points: [[0, 0], [5, 5]] });
  h.add({ tool: 'rect', color: '#00f', width: 2, x1: 0, y1: 0, x2: 10, y2: 10 });
  assert.equal(h.shapes.length, 2);
  assert.ok(h.undo()); assert.equal(h.shapes.length, 1); assert.ok(h.canRedo);
  assert.ok(h.redo()); assert.equal(h.shapes.length, 2);
  h.undo(); h.add({ tool: 'line', color: '#000', width: 1, x1: 0, y1: 0, x2: 1, y2: 1 });
  assert.equal(h.canRedo, false);
  assert.ok(h.clear()); assert.equal(h.clear(), false);
});
test('drawing validation rejects unknown tools and empty strokes', () => {
  assert.throws(() => normalizeShape({ tool: 'laser' }), TypeError);
  assert.throws(() => normalizeShape({ tool: 'pen', points: [] }), TypeError);
  assert.equal(normalizeShape({ tool: 'pen', color: 'red', width: 999, points: [[1, 1]] }).width, 64);
  assert.equal(normalizeShape({ tool: 'pen', color: 'url(javascript:x)', width: 1, points: [[1, 1]] }).color, '#000000');
});
test('SVG export reflects shapes, escapes text and paints the eraser with the background', () => {
  const h = createHistory([
    { tool: 'text', color: '#123456', width: 1, x: 5, y: 20, text: '<b>&</b>', size: 20 },
    { tool: 'eraser', color: '#000', width: 10, points: [[0, 0], [9, 9]] },
    { tool: 'ellipse', color: '#0f0', width: 2, x1: 0, y1: 0, x2: 10, y2: 20, fill: true },
  ]);
  const svg = toSvg(h.shapes, { width: 100, height: 50, background: '#fafafa' });
  assert.match(svg, /&lt;b&gt;&amp;&lt;\/b&gt;/);
  assert.match(svg, /stroke="#fafafa"/);
  assert.match(svg, /<ellipse cx="5" cy="10" rx="5" ry="10" fill="#0f0"/);
  assert.doesNotMatch(svg, /<script/);
});
test('restoreHistory round trips and rejects foreign versions', () => {
  const h = createHistory([{ tool: 'line', color: '#000', width: 1, x1: 0, y1: 0, x2: 4, y2: 4 }]);
  assert.equal(restoreHistory(JSON.stringify(h)).shapes.length, 1);
  assert.throws(() => restoreHistory({ version: 2, shapes: [] }), TypeError);
});
test('constrainPoint snaps to 45 degrees and squares', () => {
  assert.deepEqual(constrainPoint(0, 0, 10, 1, 'line'), [10.05, 0]);
  assert.deepEqual(constrainPoint(0, 0, 10, 4, 'rect'), [10, 10]);
});
