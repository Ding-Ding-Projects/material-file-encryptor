import test from 'node:test';
import assert from 'node:assert/strict';
import { filterVersions, compareText, selectedVersions } from '../src/renderer/features/file-details/model.js';

test('versions filter includes the full UTC day and stable selected ids', () => {
 const rows = [{ id:'v1', path:'renamed.txt', timestampUtc:'2026-10-10T23:59:59.999Z' }, { id:'v2', path:'before.txt', timestampUtc:'2026-10-09T23:59:59Z' }];
 assert.deepEqual(filterVersions(rows, { from:'2026-10-10', to:'2026-10-10', pattern:'renamed\\.txt$' }), [rows[0]]);
 assert.deepEqual(selectedVersions(rows, new Set(['v1'])), [rows[0]]);
 assert.deepEqual(filterVersions([], {}), []);
 assert.throws(() => filterVersions(rows, { pattern:'[' }), SyntaxError);
});
test('text comparison preserves markup as text and reports changes', () => {
 assert.equal(compareText('a\n<script>', 'a\n<img>'), '  a\n- <script>\n+ <img>');
 assert.throws(() => compareText('x\n'.repeat(5001), ''), /5,000/);
});
