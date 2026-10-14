import test from 'node:test';
import assert from 'node:assert/strict';
import {readNarration, saveNarration, voicesFor, narrationScript, speak, stopSpeech} from '../browser-extension/narration.js';
import {checkTicket, checkAttachment, saveTicket, readTickets, deleteTicket, diagnosticsText, ticketExport, ticketsKey} from '../browser-extension/tickets.js';

const store = () => { const values = new Map(); return {values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key)}; };

test('narration settings are bounded and voices follow the interface language', () => {
  const s = store();
  assert.deepEqual(readNarration(s), {voice: '', rate: 1});
  assert.deepEqual(saveNarration(s, {voice: 'Tracy', rate: 9}), {voice: 'Tracy', rate: 2});
  assert.deepEqual(readNarration(s), {voice: 'Tracy', rate: 2});
  const voices = [{name: 'A', lang: 'en-GB'}, {name: 'B', lang: 'zh-HK'}, {name: 'C', lang: 'fr-FR'}];
  assert.deepEqual(voicesFor(voices, 'en').map(v => v.name), ['A']);
  assert.deepEqual(voicesFor(voices, 'yue').map(v => v.name), ['B']);
  assert.deepEqual(voicesFor(voices, 'bilingual').map(v => v.name), ['A', 'B']);
});

test('narration names controls with their role and replaces any speech already queued', () => {
  const script = narrationScript([{kind: 'heading', text: 'Notes'}, {kind: 'button', text: 'New note'}, {kind: 'button', text: 'Delete selected', disabled: true}, {kind: 'text', text: '  '}]);
  assert.deepEqual(script, ['Notes', 'New note, button', 'Delete selected, button, unavailable']);
  const calls = [];
  const synth = {cancel: () => calls.push('cancel'), speak: utterance => calls.push(utterance.text + '@' + utterance.rate)};
  class Utterance { constructor(text) { this.text = text; } }
  assert.equal(speak(synth, script, {rate: 1.5}, Utterance), 3);
  assert.deepEqual(calls, ['cancel', 'Notes@1.5', 'New note, button@1.5', 'Delete selected, button, unavailable@1.5']);
  stopSpeech(synth);
  assert.equal(calls.at(-1), 'cancel');
  assert.equal(speak(null, script), 0);
});

test('tickets are checked before saving, edited in place and deleted', () => {
  const s = store(), now = new Date('2026-10-14T10:00:00Z');
  assert.equal(checkTicket({title: '', description: 'x', category: 'problem'}), 'Enter a title.');
  assert.equal(checkTicket({title: 't', description: 'x', category: 'rant'}), 'Choose a category.');
  assert.deepEqual(saveTicket(s, {title: 't', description: '', category: 'problem'}), {error: 'Describe what happened.'});
  assert.equal(s.values.has(ticketsKey), false);
  const {ticket} = saveTicket(s, {title: 'Pairing fails', description: 'The desktop never asks.', category: 'problem', diagnostics: false, attachments: []}, now);
  assert.equal(ticket.status, 'open');
  const edited = saveTicket(s, {...ticket, status: 'closed', description: 'Fixed after restart.'}, new Date('2026-10-14T11:00:00Z')).ticket;
  assert.equal(edited.id, ticket.id);
  assert.equal(edited.createdAt, ticket.createdAt);
  assert.equal(readTickets(s)[0].status, 'closed');
  assert.deepEqual(saveTicket(s, {...ticket, id: 'gone'}), {error: 'That ticket no longer exists.'});
  assert.equal(deleteTicket(s, ticket.id), true);
  assert.equal(readTickets(s).length, 0);
});

test('attachments are bounded by count, type and size, and diagnostics are included only when chosen', () => {
  assert.equal(checkAttachment({type: 'application/x-msdownload', size: 10}), 'Attach PNG, JPEG, WebP, text or JSON files.');
  assert.equal(checkAttachment({type: 'image/png', size: 300000}), 'Attach files of 200 KB or less.');
  assert.equal(checkAttachment({type: 'image/png', size: 10}, [1, 2, 3]), 'Attach at most 3 files.');
  assert.equal(checkAttachment({type: 'text/plain', size: 10}), '');
  const diagnostics = diagnosticsText({version: '0.1.0', sourceCommit: 'a'.repeat(40), language: 'en', theme: 'dark', userAgent: 'Edge'});
  assert.match(diagnostics, /Source commit: aaaaaaaaaaaa/);
  const base = {title: 'T', category: 'question', status: 'open', description: 'D', createdAt: 'c', updatedAt: 'u', attachments: []};
  assert.equal(JSON.parse(ticketExport({...base, diagnostics: false}, diagnostics)).diagnostics, undefined);
  assert.equal(JSON.parse(ticketExport({...base, diagnostics: true}, diagnostics)).diagnostics, diagnostics);
});
