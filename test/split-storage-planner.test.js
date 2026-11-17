import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { planPlacement, diffPlan, unavailableParts } from '../src/main/split-storage/planner.js';

const parts = (count, size = 1000) => Array.from({ length: count }, (_, i) => ({ id: randomBytes(16).toString('hex'), size: size + i % 7 }));
const share = (id, weight, extra = {}) => ({ id, kind: id === 'main' ? 'main' : 'folder', role: 'share', weight, capacityBytes: 0, enabled: true, ...extra });
const counts = plan => { const result = {}; for (const holders of plan.targets.values()) for (const id of holders) result[id] = (result[id] ?? 0) + 1; return result; };

test('placement is deterministic for the same parts and locations', () => {
  const list = parts(500), locations = [share('main', 2), share('usb', 1), share('nas', 1)];
  const first = planPlacement({ parts: list, locations, copies: 1 });
  const second = planPlacement({ parts: [...list].reverse(), locations: [...locations].reverse(), copies: 1 });
  assert.deepEqual([...first.targets].sort(), [...second.targets].sort());
});

test('weights set each location share', () => {
  const plan = planPlacement({ parts: parts(4000), locations: [share('main', 2), share('usb', 1), share('hub', 1)], copies: 1 });
  const result = counts(plan);
  assert.ok(Math.abs(result.main / 4000 - 0.5) < 0.04, `main ${result.main}`);
  assert.ok(Math.abs(result.usb / 4000 - 0.25) < 0.04, `usb ${result.usb}`);
  assert.ok(Math.abs(result.hub / 4000 - 0.25) < 0.04, `hub ${result.hub}`);
});

test('copies land in distinct locations', () => {
  const plan = planPlacement({ parts: parts(300), locations: [share('main', 1), share('usb', 1), share('nas', 1)], copies: 2 });
  for (const holders of plan.targets.values()) { assert.equal(holders.length, 2); assert.equal(new Set(holders).size, 2); }
});

test('capacity caps are honoured and overflow falls back to main', () => {
  const plan = planPlacement({ parts: parts(200, 1000), locations: [share('main', 0), share('usb', 1, { capacityBytes: 50000 })], copies: 1 });
  assert.ok(plan.bytes.usb <= 50000);
  assert.ok(plan.overflowParts > 0);
  for (const holders of plan.targets.values()) assert.equal(holders.length, 1);
  assert.equal(counts(plan).main, plan.overflowParts);
});

test('rule pins win and unpinned parts spread', () => {
  const list = parts(100), pins = Object.fromEntries(list.slice(0, 10).map(part => [part.id, 'usb']));
  const plan = planPlacement({ parts: list, locations: [share('main', 1), share('usb', 0), share('hub', 1)], copies: 1, pins });
  for (const part of list.slice(0, 10)) assert.deepEqual(plan.targets.get(part.id), ['usb']);
  for (const part of list.slice(10)) assert.notEqual(plan.targets.get(part.id)[0], 'usb', 'a weight of zero takes no unpinned parts');
});

test('adding a location moves only a fair share, and only onto the new location', () => {
  const list = parts(3000), before = planPlacement({ parts: list, locations: [share('main', 1), share('usb', 1)], copies: 1 });
  const after = planPlacement({ parts: list, locations: [share('main', 1), share('usb', 1), share('nas', 1)], copies: 1 });
  let moved = 0;
  for (const part of list) {
    const old = before.targets.get(part.id)[0], next = after.targets.get(part.id)[0];
    if (old !== next) { moved++; assert.equal(next, 'nas', 'a part moved between two old locations'); }
  }
  assert.ok(Math.abs(moved / 3000 - 1 / 3) < 0.04, `moved ${moved}`);
});

test('disabled placement brings every part back to main', () => {
  const list = parts(20), plan = planPlacement({ parts: list, locations: [share('main', 1), share('usb', 5)], copies: 1, enabled: false });
  for (const holders of plan.targets.values()) assert.deepEqual(holders, ['main']);
});

test('diff and unavailable parts follow the manifest', () => {
  const [a, b] = parts(2);
  const placement = { parts: { [a.id]: ['usb'] } };
  const targets = new Map([[a.id, ['usb']], [b.id, ['usb']]]);
  const diff = diffPlan(placement, targets, { [a.id]: 10, [b.id]: 20 });
  assert.equal(diff.movesPending, 1); assert.equal(diff.bytesToMove, 20);
  assert.deepEqual(unavailableParts(placement, ['usb']), [a.id]);
  assert.deepEqual(unavailableParts(placement, ['hub']), []);
});
