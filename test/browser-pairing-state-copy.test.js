import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = name => fs.readFile(new URL(name, import.meta.url), 'utf8');
const popup = await read('../browser-extension/popup.js');
const options = await read('../browser-extension/options.js');
const background = await read('../browser-extension/background.js');
const search = await read('../src/shared/surface/search.js');

test('the reconnecting wording does not promise a recovery the desktop will not honor, in every language', () => {
  for (const [name, source] of [['popup', popup], ['options', options]]) {
    assert.doesNotMatch(source, /pairing is kept|Your pairing is kept|保留配對|會保留配對/, name);
    assert.match(source, /Reconnecting to the desktop\. Open and unlock it\. If it was closed or locked since you paired, you will need to pair again\./, name);
    assert.match(source, /如果配對之後桌面曾經關閉或鎖定，就要重新配對/, name);
  }
  assert.match(popup, /expired:\['Pairing expired\. Pair this browser again\.'/);
  assert.match(options, /Pairing expired\. Pair this browser again\./);
});

test('both pages poll the worker for the pairing state and only the worker talks to the desktop', () => {
  for (const [name, source] of [['popup', popup], ['options', options]]) {
    assert.match(source, /type:'verify-pairing'/, name);
    assert.match(source, /document\.hidden/, `${name} does not poll while hidden`);
  }
  assert.match(background, /message\?\.type==='verify-pairing'/);
  assert.match(background, /'verify-pairing'\]\);/, 'a restarted worker resumes before answering');
});

test('the menu filter field keeps room for its bilingual label beside the regex builder button', () => {
  assert.match(search, /:host\(\[data-menu-search\]\) \.query\{min-width:min\(240px,100%\)\}/);
});
