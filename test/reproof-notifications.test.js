import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

async function rendererFunctions(...names) {
  const source = await fs.readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
  return names.map(name => {
    const start = source.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name + ' must exist');
    let depth = 0, index = source.indexOf('{', start);
    for (; index < source.length; index++) {
      if (source[index] === '{') depth++;
      if (source[index] === '}' && --depth === 0) break;
    }
    return source.slice(start, index + 1);
  }).join('\n');
}

test('a refused wording file is a transient notification, never a banner that outlives the action', async () => {
  const code = await rendererFunctions('clearMainError', 'showTransientError');
  const elements = {'main-error': {hidden: true}, snackbar: {hidden: true, textContent: ''}};
  const notices = [];
  const timers = [];
  const make = new Function('$', 'plainErrorMessage', 't', 'foundation', 'setTimeout', 'clearTimeout', 'snackbarTimer',
    code + '\nreturn {clearMainError, showTransientError};');
  const api = make(id => elements[id], error => error.message, text => text, {notify: n => notices.push(n)},
    (fn, ms) => { timers.push({fn, ms}); return timers.length; }, () => {}, undefined);
  api.showTransientError(new Error('The wording file is not valid.'));
  assert.equal(elements['main-error'].hidden, true, 'the persistent banner must stay hidden');
  assert.equal(elements.snackbar.hidden, false);
  assert.equal(elements.snackbar.textContent, 'The wording file is not valid.');
  assert.equal(notices.length, 1);
  assert.equal(notices[0].level, 'error');
  timers[0].fn();
  assert.equal(elements.snackbar.hidden, true, 'the message clears itself');
  elements['main-error'].hidden = false;
  api.clearMainError();
  assert.equal(elements['main-error'].hidden, true);
});

test('wording refusals use the transient path and view changes and successful applies clear the banner', async () => {
  const source = await fs.readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
  assert.match(source, /refuse: \(code, error\) => showTransientError\(/);
  assert.match(source, /catch\(error\) \{ if \(version === vocabularyUploadVersion\) showTransientError\(error\)/);
  assert.match(source, /function changeView\(next\) \{[\s\S]*?view = next; clearMainError\(\);/);
  assert.match(source, /applyPreferences\(\); clearMainError\(\); toast\(vocabularyPersisted \? 'Saved\.'/);
  assert.match(source, /applyPreferences\(\); clearMainError\(\); toast\(vocabularyPersisted \? 'Original wording restored\.'/);
  assert.doesNotMatch(source, /refuse: \(code, error\) => showError\(/);
});

test('the extension clears a refused wording message on its own after the notice', async () => {
  const source = await fs.readFile(new URL('../browser-extension/options.js', import.meta.url), 'utf8');
  assert.match(source, /wordingNotice\.show\(wordingText\(pair\)\);setTimeout\(\(\)=>\{if\(wordingMessage===pair\)\{wordingMessage=undefined;renderWording\(\);\}\},5000\);/);
});
