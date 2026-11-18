import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { formatShareCommand, parseShareCommand, shareLink, shareCommandLine, shareRepositoryFor, redactShareCommand } from '../src/main/share/share-command.js';
import { WRAPPED_KEY_BYTES } from '../src/main/share/share-crypto.js';

const digest = 'sha256:' + 'ab'.repeat(32);
const repository = 'someone/material-file-encryptor-shares';
const key = randomBytes(32);
const command = formatShareCommand({ repository, digest, key });
const codeOf = fn => { try { fn(); return 'none'; } catch (error) { return error.code; } };

test('a command formats and parses back to the same share', () => {
  assert.match(command, /^mfe-share:v1:registry-1\.docker\.io\/someone\/material-file-encryptor-shares@sha256:[a-f0-9]{64}#[A-Za-z0-9_-]{43}$/);
  const parsed = parseShareCommand(command);
  assert.equal(parsed.repository, repository); assert.equal(parsed.digest, digest); assert.deepEqual(parsed.key, key); assert.equal(parsed.needsPassphrase, false);
});

test('the link, a command line and surrounding whitespace all parse to the same share', () => {
  for (const text of [shareLink(command), shareCommandLine(command), `  ${command}\n`, shareLink(command).replace('#', '%23'), shareLink(command) + '/'])
    assert.deepEqual(parseShareCommand(text).key, key, text.slice(0, 40));
  assert.match(shareCommandLine(command), /^"%LOCALAPPDATA%\\MaterialFileEncryptor\\MaterialFileEncryptor\.exe" --receive "mfe-share:/);
});

test('a passphrase command carries the wrapped key only', () => {
  const wrapped = randomBytes(WRAPPED_KEY_BYTES);
  const parsed = parseShareCommand(formatShareCommand({ repository, digest, wrapped }));
  assert.equal(parsed.needsPassphrase, true); assert.equal(parsed.key, null); assert.deepEqual(parsed.wrapped, wrapped);
});

test('malicious and malformed input is refused without echoing it', () => {
  const cases = {
    COMMAND_INVALID: ['', 'hello', command + ' ' + command, command.replace('#', ''), command + '#x', command.slice(0, -1), command.slice(0, -1) + '=', command.replace('sha256:ab', 'sha256:AB'),
      command.replace('@sha256', '/../x@sha256'), command + '\u0000', 'x'.repeat(5000), command.replace('#', '#p:'), command.replace('someone', 'Some+one'), 'MFE-SHARE:v1:' + command.slice(13)],
    UNKNOWN_VERSION: [command.replace(':v1:', ':v2:'), shareLink(command).replace('/v1/', '/v9/')],
    FOREIGN_HOST: [command.replace('registry-1.docker.io', 'evil.example'), command.replace('registry-1.docker.io', '127.0.0.1:5000')],
    FOREIGN_REPOSITORY: [command.replace('material-file-encryptor-shares', 'backups')],
  };
  for (const [code, inputs] of Object.entries(cases)) for (const input of inputs) {
    let error; try { parseShareCommand(input); } catch (caught) { error = caught; }
    assert.equal(error?.code, code, JSON.stringify(input.slice(0, 80)));
    assert.equal(error.message.includes(key.toString('base64url')), false);
  }
});

test('a loopback registry is admitted only with the explicit test capability', () => {
  const local = formatShareCommand({ host: '127.0.0.1:15221', repository, digest, key });
  assert.equal(codeOf(() => parseShareCommand(local)), 'FOREIGN_HOST');
  assert.equal(parseShareCommand(local, { allowTestHosts: true }).host, '127.0.0.1:15221');
});

test('the share repository is derived from the account and redaction hides the key', () => {
  assert.equal(shareRepositoryFor('TransitDC'), 'transitdc/material-file-encryptor-shares');
  assert.equal(codeOf(() => shareRepositoryFor('a/b')), 'COMMAND_INVALID');
  assert.equal(redactShareCommand(command).includes(key.toString('base64url')), false);
  assert.match(redactShareCommand(command), /#\[redacted\]$/);
});
