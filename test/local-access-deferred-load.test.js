import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessDocument} from './helpers/local-access-dom.js';
import {mountAccess} from '../src/renderer/features/access/index.js';

const settle = () => new Promise(resolve => setTimeout(resolve, 20));
function mount(options) {
  const document = createAccessDocument(), root = document.createElement('main');
  document.body.append(root);
  const reads = [], notices = [];
  const credentialStore = {get: async key => { reads.push(key); throw new Error('Unlock the local profile first.'); }, set: async () => {}, delete: async () => {}};
  const api = mountAccess(root, {storage: {getItem: () => null, setItem() {}}, credentialStore, notify: message => notices.push(message), ...options});
  return {api, reads, notices};
}

test('a host that opens its store only after sign-in does not read authenticators at mount', {timeout: 5000}, async () => {
  const {api, reads, notices} = mount({deferAuthenticatorLoad: true});
  await settle();
  assert.deepEqual(reads, [], 'no protected read happens before sign-in');
  assert.deepEqual(notices, [], 'a first visit shows no unlock error');
  api.destroy?.();
});

test('the default host still loads authenticators at mount', {timeout: 5000}, async () => {
  const {api, reads} = mount({});
  await settle();
  assert.ok(reads.includes('authenticator:index:v1'), 'the desktop path keeps its eager load');
  api.destroy?.();
});
