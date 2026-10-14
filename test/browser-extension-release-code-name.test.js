import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseCodeName, parsePhotoUrl, matchRelease, releaseSourceCommit, releasePageUrl} from '../browser-extension/release-code-name.js';

const photo = 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/hk-dish-0001-har-gow.png';
const body = commit => `Unsigned release from \`${commit}\`. Package version 0.2.0.\n\nCode name: Classic Har Gow / 蝦餃. Photo is linked from the authoritative public catalog release, not copied into this release.\n\n![Classic Har Gow 蝦餃](${photo})\n`;

test('the code name is read from the exact release line in both languages', () => {
  assert.deepEqual(parseReleaseCodeName(body('a'.repeat(40))), {english: 'Classic Har Gow', chinese: '蝦餃'});
  assert.deepEqual(parseReleaseCodeName('Code name: Siu Mai / 燒賣.\r\n'), {english: 'Siu Mai', chinese: '燒賣'});
  assert.deepEqual(parseReleaseCodeName('Code name: Mr. Wong Tart / 王先生撻. Photo is linked from x.'), {english: 'Mr. Wong Tart', chinese: '王先生撻'});
});

test('a missing, malformed or non-text code name line gives null', () => {
  for (const value of [undefined, null, 42, '', 'No name here', 'Code name: Only English.', 'code name: A / B.', 'Prefix Code name: A / B.']) assert.equal(parseReleaseCodeName(value), null);
});

test('names that are too long or carry control characters, brackets, angle brackets or backticks are rejected', () => {
  assert.equal(parseReleaseCodeName(`Code name: ${'x'.repeat(181)} / 蝦餃.`), null);
  assert.ok(parseReleaseCodeName(`Code name: ${'x'.repeat(180)} / 蝦餃.`));
  for (const bad of ['A[1]', 'A]', '<b>A</b>', 'A>', 'A`B', 'A\u0007B', 'A\u007fB']) {
    assert.equal(parseReleaseCodeName(`Code name: ${bad} / 蝦餃.`), null, bad);
    assert.equal(parseReleaseCodeName(`Code name: Har Gow / ${bad}.`), null, bad);
  }
});

test('the photo address is accepted only as an exact catalogue release asset', () => {
  assert.equal(parsePhotoUrl(body('b'.repeat(40))), photo);
  assert.equal(parsePhotoUrl('![x](https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.2-a/dish_1.webp)'), 'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.2-a/dish_1.webp');
  for (const bad of [
    'https://example.com/a.png',
    'http://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/a.png',
    'https://github.com/Ding-Ding-Projects/other/releases/download/catalog-v1/a.png',
    'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/v1/a.png',
    'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/a.svg',
    'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/a.png?x=1',
    'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/sub/a.png',
    'https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/../a.png',
    'https://github.com.evil.example/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1/a.png',
  ]) assert.equal(parsePhotoUrl(`![x](${bad})`), null, bad);
  assert.equal(parsePhotoUrl('no image'), null);
  assert.equal(parsePhotoUrl(undefined), null);
});

test('the first valid photo wins even when an earlier image is foreign', () => {
  assert.equal(parsePhotoUrl(`![a](https://example.com/a.png)\n![b](${photo})`), photo);
});

const release = (tag, extra = {}) => ({tag_name: tag, draft: false, prerelease: false, published_at: '2026-10-01T00:00:00Z', body: '', ...extra});

test('drafts and prereleases are ignored when matching', () => {
  const releases = [release('v1.568.1', {draft: true}), release('v1.568.1', {prerelease: true}), release('v1.567.1', {published_at: '2026-09-01T00:00:00Z'})];
  const result = matchRelease(releases, '1.568.1');
  assert.equal(result.state, 'unmatched');
  assert.equal(result.latest.tag_name, 'v1.567.1');
});

test('a published release with the staged version tag is matched', () => {
  const wanted = release('v1.568.1', {body: body('c'.repeat(40))});
  const result = matchRelease([release('v1.569.1'), wanted, release('v1.567.1')], '1.568.1');
  assert.equal(result.state, 'matched');
  assert.equal(result.by, 'tag');
  assert.equal(result.release, wanted);
});

test('an unmatched build reports the newest published release separately and never as its own', () => {
  const result = matchRelease([release('v1.1.1', {published_at: '2026-01-01T00:00:00Z'}), release('v1.9.1', {published_at: '2026-09-09T00:00:00Z'})], '0.1.0');
  assert.deepEqual(Object.keys(result).sort(), ['latest', 'state']);
  assert.equal(result.state, 'unmatched');
  assert.equal(result.latest.tag_name, 'v1.9.1');
  assert.deepEqual(matchRelease([], '0.1.0'), {state: 'unmatched', latest: null});
  assert.deepEqual(matchRelease('nonsense', '0.1.0'), {state: 'unmatched', latest: null});
});

test('a clean build can also match by the source commit named in the release notes, and an unsafe version cannot match by tag', () => {
  const commit = 'd'.repeat(40);
  const wanted = release('v1.570.1', {body: body(commit)});
  assert.equal(releaseSourceCommit(wanted.body), commit);
  const result = matchRelease([release('v1.571.1'), wanted], '0.1.0', commit);
  assert.equal(result.state, 'matched');
  assert.equal(result.by, 'commit');
  assert.equal(matchRelease([wanted], '0.1.0', null).state, 'unmatched');
  assert.equal(matchRelease([wanted], '0.1.0', 'not-a-commit').state, 'unmatched');
  assert.equal(matchRelease([release('vlatest')], 'latest').state, 'unmatched');
});

test('release page addresses are built only for well-formed tags', () => {
  assert.equal(releasePageUrl({tag_name: 'v1.568.1'}), 'https://github.com/Ding-Ding-Projects/material-file-encryptor/releases/tag/v1.568.1');
  for (const tag of ['../x', 'v1/../../x', 'v1.2 3', '', 'javascript:alert(1)', undefined]) assert.equal(releasePageUrl({tag_name: tag}), null, String(tag));
});
