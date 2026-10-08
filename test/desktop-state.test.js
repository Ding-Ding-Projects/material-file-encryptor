import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { waitForDesktopState } from '../scripts/desktop-state.mjs';

test('desktop state polling awaits false IPC replies until completion and rejects unmet states', async () => {
  const executablePath = process.env.CHROMIUM_PATH || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined);
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.evaluate(() => {
      let calls = 0;
      window.drive = { status: async () => ({ locked: ++calls >= 3, calls }) };
    });
    const state = await waitForDesktopState(page, value => value.locked, 3000);
    assert.equal(state.locked, true);
    assert.ok(state.calls >= 3, 'A Promise resolving false must not satisfy the condition.');
    await assert.rejects(waitForDesktopState(page, () => false, 200));
  } finally { await browser.close(); }
});
