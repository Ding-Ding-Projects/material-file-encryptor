import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createTrayNotice, trayNoticeText} from '../src/main/tray-notice.js';

test('the tray notice is written in English, Cantonese or both and explains how to quit', () => {
  const en = trayNoticeText('en'), yue = trayNoticeText('yue'), both = trayNoticeText('bilingual');
  assert.match(en.content, /still running|keeps Material File Encryptor running/i);
  assert.match(en.content, /Ctrl\+Q/);
  assert.match(en.content, /Quit/);
  assert.doesNotMatch(en.title + en.content, /[一-鿿]/);
  assert.match(yue.content, /Ctrl\+Q/);
  assert.match(yue.content, /結束/);
  assert.match(both.title, /Still running in the tray · 仍然喺系統匣運行/);
  assert.match(both.content, /Ctrl\+Q/);
});

test('the notice is shown once per profile, never blocks, and never throws', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mfe-tray-notice-'));
  const marker = path.join(directory, 'tray-notice-shown.json');
  const shown = [];
  const notice = createTrayNotice({markerPath: () => marker, show: value => shown.push(value), getLanguage: async () => 'yue'});
  assert.equal(await notice.maybeShow(), true);
  assert.equal(await notice.maybeShow(), false, 'a second close shows nothing');
  assert.equal(shown.length, 1);
  assert.match(shown[0].content, /結束/);
  const again = createTrayNotice({markerPath: () => marker, show: value => shown.push(value)});
  assert.equal(await again.maybeShow(), false, 'the marker survives a restart');
  assert.equal(shown.length, 1);
  const broken = createTrayNotice({markerPath: () => path.join(directory, 'other.json'), show: () => { throw Error('balloon failed'); }, getLanguage: async () => { throw Error('no window'); }});
  assert.equal(await broken.maybeShow(), false, 'a failing balloon is swallowed so the window still hides');
  const english = [];
  const fallback = createTrayNotice({markerPath: () => path.join(directory, 'third.json'), show: value => english.push(value), getLanguage: async () => 'klingon'});
  await fallback.maybeShow();
  assert.doesNotMatch(english[0].content, /[一-鿿]/, 'an unknown language falls back to English');
  await fs.rm(directory, {recursive: true, force: true});
});
