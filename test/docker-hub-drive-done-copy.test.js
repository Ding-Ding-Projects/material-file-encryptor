import test from 'node:test';
import assert from 'node:assert/strict';
import { HUB_DRIVE_COPY } from '../src/renderer/features/docker-hub-drive/copy.js';

test('the new drive steps and done message describe automatic backup, not the old hourly sync', () => {
  const [step, stepYue] = HUB_DRIVE_COPY.createDestination, [detail] = HUB_DRIVE_COPY.createDestinationDetail, [body, bodyYue] = HUB_DRIVE_COPY.createdBody;
  assert.equal(step, 'Turning on automatic backup'); assert.equal(stepYue, '開啟自動備份');
  assert.match(detail, /about a minute after the drive goes idle/);
  assert.match(body, /Automatic backup is on: changes back up about a minute after the drive goes idle/);
  assert.match(bodyYue, /自動備份已開啟/);
  for (const [en, yue] of [HUB_DRIVE_COPY.createDestination, HUB_DRIVE_COPY.createDestinationDetail, HUB_DRIVE_COPY.createSync, HUB_DRIVE_COPY.createdBody]) {
    assert.doesNotMatch(en, /60 minutes|schedule|Automatic sync/); assert.doesNotMatch(yue, /60 分鐘|排程/);
  }
});
