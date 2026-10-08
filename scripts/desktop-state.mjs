import { expect } from 'playwright/test';

// IPC status is asynchronous. Page waitForFunction treats a returned Promise as
// truthy in our pinned Playwright version, so poll and await each bridge reply.
export async function waitForDesktopState(page, predicate, timeout = 30000) {
  let state;
  await expect.poll(async () => {
    state = await page.evaluate(() => window.drive.status());
    return Boolean(predicate(state));
  }, { timeout, intervals: [50, 100, 250], message: 'Wait for the requested desktop state.' }).toBe(true);
  return state;
}
