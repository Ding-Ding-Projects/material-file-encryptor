import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registryLoginText } from '../src/renderer/features/storage-maintenance/registry-login-text.js';

const source = name => readFileSync(new URL(`../src/renderer/features/${name}`, import.meta.url), 'utf8');

test('every key the sign-in panel shows has real wording in both languages outside the backup page', () => {
  const panel = source('storage-maintenance/registry-login-panel.js');
  const model = source('storage-maintenance/registry-login-model.js');
  const keys = new Set([
    ...[...panel.matchAll(/this\.t\('(login[A-Za-z0-9]+)'\)/g)].map(match => match[1]),
    'loginStep1', 'loginStep2', 'loginStep3', 'loginStart', 'loginRefresh', 'loginCopy', 'loginOpen', 'loginCancel',
    ...[...model.matchAll(/'(login[A-Z][A-Za-z0-9]+)'/g)].map(match => match[1]),
  ]);
  assert.ok(keys.size >= 15, `found ${keys.size} keys`);
  for (const key of keys) {
    const en = registryLoginText(key, 'en'), yue = registryLoginText(key, 'yue');
    assert.notEqual(en, key, `English wording missing for ${key}`);
    assert.notEqual(yue, key, `Cantonese wording missing for ${key}`);
    assert.notEqual(en, yue, `Cantonese wording for ${key} is the English text`);
  }
  assert.equal(registryLoginText('loginTitle', 'en'), 'Sign in to Docker Hub', 'outside the backup page the title is not numbered');
  assert.equal(registryLoginText('loginTitle', 'zh-HK'), '登入 Docker Hub');
  assert.equal(registryLoginText('not-a-key', 'en'), 'not-a-key');
});

test('the Docker Hub drive and Share dialogs use the shared sign-in wording', () => {
  for (const file of ['docker-hub-drive/dialog.js', 'share/dialog.js']) {
    const dialog = source(file);
    assert.match(dialog, /new RegistryLoginPanel\(\{ translate: key => registryLoginText\(key, this\.language\)/, file);
    assert.doesNotMatch(dialog, /REGISTRY_LOGIN_COPY\[key\]/, file);
  }
});
