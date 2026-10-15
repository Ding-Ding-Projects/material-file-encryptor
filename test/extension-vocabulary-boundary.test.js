import test from 'node:test';
import assert from 'node:assert/strict';
import {wordingActive, entriesFor, publicCopy, carriesWording, assertPublic} from '../browser-extension/vocabulary-boundary.js';
import {parseVocabulary, applyVocabulary} from '../browser-extension/vocabulary.js';
import {exportChangelog} from '../browser-extension/exports.js';
import {notesMarkdown} from '../browser-extension/notes.js';
import {diagnosticsText} from '../browser-extension/tickets.js';
import {buildReport} from '../browser-extension/status-client.js';

const entries = parseVocabulary(JSON.stringify({schemaVersion: 1, entries: {Notes: 'Jottings', Changelog: 'Release notes', Status: 'Health'}})).entries;

test('wording is active only for an active pairing', () => {
  assert.equal(wordingActive(true), true);
  for (const state of [false, null, undefined, 'true', 1]) assert.equal(wordingActive(state), false);
  assert.deepEqual(entriesFor(true, entries), entries);
  for (const state of [false, null, undefined]) assert.deepEqual(entriesFor(state, entries), []);
  assert.deepEqual(entriesFor(true, null), []);
});

test('before authorization every string stays the original, and after it the wording applies', () => {
  const pair = ['Open Notes', '開啟筆記'];
  assert.equal(applyVocabulary(pair[0], entriesFor(null, entries)), 'Open Notes');
  assert.equal(applyVocabulary(pair[0], entriesFor(true, entries)), 'Open Jottings');
});

test('public copy never applies wording, in any language', () => {
  const pair = ['Extension workspace', '擴充功能工作區'];
  assert.equal(publicCopy(pair, 'en'), 'Extension workspace');
  assert.equal(publicCopy(pair, 'bilingual'), 'Extension workspace');
  assert.equal(publicCopy(pair, 'yue'), '擴充功能工作區');
});

test('exports, note files, diagnostics and status reports are built from data and never carry wording', () => {
  const changelog = [{title: 'Notes sweep', date: '2026-10-14', items: ['Changelog tidy'], yue: ''}];
  for (const format of ['json', 'csv', 'markdown']) {
    const text = exportChangelog(changelog, format);
    assert.equal(carriesWording(text, entries), false, format);
    assert.ok(text.includes('Notes'), 'the original words are kept');
  }
  const note = {id: 'n1', title: 'Notes', body: 'Status of the Changelog', createdAt: '2026-10-14T00:00:00.000Z', updatedAt: '2026-10-14T00:00:00.000Z'};
  assert.equal(carriesWording(notesMarkdown([note]), entries), false);
  assert.equal(carriesWording(diagnosticsText({version: '0.1.0', sourceCommit: null, language: 'en', theme: 'system', userAgent: 'test'}), entries), false);
  assert.equal(carriesWording(buildReport({version: '0.1.0', counts: {notes: 1}}), entries), false);
});

test('the boundary guard detects wording that would cross it', () => {
  assert.equal(carriesWording('Open Jottings', entries), true);
  assert.equal(carriesWording({title: 'Release notes'}, entries), true);
  assert.equal(carriesWording('Open Notes and Jottings', entries), false, 'the original is present, so nothing was swapped in');
  assert.throws(() => assertPublic('Health report', entries), /must not leave this page/);
  assert.equal(assertPublic('Status report', entries), 'Status report');
  assert.equal(carriesWording('anything', []), false);
});
