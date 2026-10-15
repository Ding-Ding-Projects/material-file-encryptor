import test from 'node:test';
import assert from 'node:assert/strict';
import {plainErrorMessage} from '../src/shared/ipc-error.js';

test('the Electron remote-method wrapper is removed so only the real message is shown', () => {
  const wrapped = new Error("Error invoking remote method 'vault:request': Error: The encrypted vault or saved unlock data is invalid or damaged.");
  assert.equal(plainErrorMessage(wrapped), 'The encrypted vault or saved unlock data is invalid or damaged.');
  assert.equal(plainErrorMessage("Error invoking remote method 'feature:request': TypeError: Bad input"), 'Bad input');
  assert.equal(plainErrorMessage("Error invoking remote method 'vault:request': Plain reason"), 'Plain reason');
});

test('ordinary messages and empty errors are unchanged or fall back', () => {
  assert.equal(plainErrorMessage(new Error('Choose a drive letter.')), 'Choose a drive letter.');
  assert.equal(plainErrorMessage(''), 'The operation could not be completed.');
  assert.equal(plainErrorMessage("Error invoking remote method 'vault:request': Error: "), 'The operation could not be completed.');
});

test('the renderer error display uses the helper', async () => {
  const source = await (await import('node:fs/promises')).readFile('src/renderer/app.js', 'utf8');
  assert.match(source, /import \{plainErrorMessage\} from '\.\.\/shared\/ipc-error\.js';/);
  assert.match(source, /function showError\(error, inDialog = false\) \{\s*const message = plainErrorMessage\(error\);/);
});
