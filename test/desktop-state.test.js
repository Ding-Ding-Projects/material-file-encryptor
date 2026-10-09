import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { waitForDesktopState } from '../scripts/desktop-state.mjs';

test('desktop state polling awaits false IPC replies until completion and rejects unmet states', async () => {
    let calls = 0;
    const context = vm.createContext({ window: { drive: { status: async () => {
      await new Promise(resolve => setImmediate(resolve));
      return { locked: ++calls >= 3, calls };
    } } } });
    // Execute the production page callback in an isolated browser-like global.
    // An unresolved Promise is truthy, but its first two awaited replies are false.
    const page = { evaluate: async callback => vm.runInContext(`(${callback.toString()})()`, context) };
    const state = await waitForDesktopState(page, value => value.locked, 3000);
    assert.equal(state.locked, true);
    assert.ok(state.calls >= 3, 'A Promise resolving false must not satisfy the condition.');
    await assert.rejects(waitForDesktopState(page, () => false, 200));
});
