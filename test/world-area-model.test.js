import test from 'node:test';
import assert from 'node:assert/strict';
import {createArea, areaBounds, toCanvas, hitTest, moveBy, resizeBy, keyboard, blocks, pixelsToChunks, MAX_AXIS} from '../src/renderer/features/server-manager/world-area-model.js';

test('the default area is 100 by 100 chunks centred on the origin', () => {
  const area = createArea();
  assert.deepEqual(area, {width: 100, depth: 100, centerX: 0, centerZ: 0});
  assert.deepEqual(areaBounds(area), {minX: -50, minZ: -50, maxX: 50, maxZ: 50});
  assert.deepEqual(blocks(area), {x: 1600, z: 1600});
});

test('the area stays within one chunk and the axis limit', () => {
  assert.equal(createArea({width: 0}).width, 1);
  assert.equal(createArea({depth: 5000}).depth, MAX_AXIS);
  assert.equal(resizeBy(createArea({width: 2}), -10, 0).width, 1);
});

test('dragging the corner resizes and dragging inside moves', () => {
  const area = createArea();
  const rect = toCanvas(area, 400);
  assert.equal(hitTest(area, 400, rect.x + rect.w, rect.y + rect.h), 'resize');
  assert.equal(hitTest(area, 400, rect.x + rect.w / 2, rect.y + rect.h / 2), 'move');
  assert.equal(hitTest(area, 400, 1, 1), null);
  assert.deepEqual(moveBy(area, 3, -2), {...area, centerX: 3, centerZ: -2});
  assert.equal(pixelsToChunks(40, area, 400), 40);
});

test('the keyboard moves with arrows and resizes with shift', () => {
  const area = createArea();
  assert.equal(keyboard(area, 'ArrowRight', false).centerX, 1);
  assert.equal(keyboard(area, 'ArrowDown', true).depth, 102);
  assert.equal(keyboard(area, 'a', false), null);
});

test('a large area shrinks the scale so the whole rectangle stays on the canvas', () => {
  const big = createArea({width: 900, depth: 900});
  const rect = toCanvas(big, 400);
  assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 400 && rect.y + rect.h <= 400);
});
