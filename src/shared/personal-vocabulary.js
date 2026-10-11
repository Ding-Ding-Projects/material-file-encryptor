// Local-only parsing and replacement. This module performs no network access.
export const MAX_VOCABULARY_BYTES = 256 * 1024;
const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
const size = text => [...text].length;
const invalid = () => { throw new Error('Invalid vocabulary JSON. Use schemaVersion 1 with entries, or version 1 with replacements.'); };
export function parseStrictJson(source, maxBytes = MAX_VOCABULARY_BYTES) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > maxBytes) throw new Error('Vocabulary JSON must be no larger than 256 KiB.');
  let position = 0;
  const whitespace = () => { while (/[\x20\t\n\r]/u.test(source[position] || '') && position < source.length) position++; };
  const string = () => {
    const start = position++;
    while (position < source.length) {
      const character = source[position++];
      if (character === '"') { try { return JSON.parse(source.slice(start, position)); } catch { invalid(); } }
      if (character === '\\') position++;
    }
    invalid();
  };
  const value = depth => {
    if (depth > 8) invalid();
    whitespace();
    const character = source[position];
    if (character === '"') return string();
    if (character === '{' || character === '[') {
      position++; whitespace();
      const object = character === '{', end = object ? '}' : ']', keys = new Set();
      if (source[position] === end) { position++; return; }
      while (position < source.length) {
        if (object) {
          if (source[position] !== '"') invalid();
          const key = string();
          if (keys.has(key) || unsafe.has(key) || size(key) > 160) invalid();
          keys.add(key); whitespace();
          if (source[position++] !== ':') invalid();
        }
        value(depth + 1); whitespace();
        if (source[position] === end) { position++; return; }
        if (source[position++] !== ',') invalid();
        whitespace();
      }
      invalid();
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(source.slice(position));
    if (!match) invalid();
    position += match[0].length;
  };
  value(0); whitespace();
  if (position !== source.length) invalid();
  try { return JSON.parse(source); } catch { invalid(); }
}
const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
export function parseVocabulary(source) {
  const value = parseStrictJson(source);
  let replacements;
  if (exact(value, ['schemaVersion', 'entries']) && value.schemaVersion === 1 && value.entries && typeof value.entries === 'object' && !Array.isArray(value.entries)) replacements = Object.entries(value.entries).map(([from, to]) => ({ from, to }));
  else if (exact(value, ['version', 'replacements']) && value.version === 1 && Array.isArray(value.replacements)) replacements = value.replacements;
  else invalid();
  const seen = new Set();
  for (const entry of replacements) {
    if (!exact(entry, ['from', 'to']) || typeof entry.from !== 'string' || typeof entry.to !== 'string' || !entry.from.trim() || size(entry.from) > 160 || size(entry.to) > 1000 || /[\u0000-\u001f\u007f-\u009f]/u.test(entry.from + entry.to) || unsafe.has(entry.from) || unsafe.has(entry.to) || seen.has(entry.from)) invalid();
    seen.add(entry.from);
  }
  return Object.freeze({ version: 1, replacements: Object.freeze(replacements.map(entry => Object.freeze({ ...entry }))) });
}
const matchers = new WeakMap();
export const RENDER_LIMITS = Object.freeze({ inputCodeUnits: 65536, outputCodeUnits: 262144, trieSteps: 1000000 });
function compiledTrie(vocabulary) {
  let root = matchers.get(vocabulary);
  if (root) return root;
  root = { children: new Map() };
  for (const { from, to } of vocabulary.replacements) {
    let node = root;
    for (const character of from) {
      if (!node.children.has(character)) node.children.set(character, { children: new Map() });
      node = node.children.get(character);
    }
    node.replacement = to;
  }
  matchers.set(vocabulary, root);
  return root;
}
function protectedParts(text) {
  const parts = [];
  let position = 0, plainStart = 0;
  while (position < text.length) {
    if (/\s/u.test(text[position])) { position++; continue; }
    const start = position;
    let quote = null;
    while (position < text.length) {
      const character = text[position];
      if (quote) { if (character === quote) quote = null; position++; continue; }
      if (character === '"' || character === "'" || character === '\x60') { quote = character; position++; continue; }
      if (/\s/u.test(character)) break;
      position++;
    }
    const token = text.slice(start, position);
    if (/[\\/]/u.test(token) || token.startsWith('--') || token.startsWith('\x60') || /\.(?:exe|json|js|dll|txt|md)\b/u.test(token) || /^\d+(?:[.,]\d+)*(?:%|KiB|MiB|GiB|KB|MB|GB|bytes)?$/u.test(token) || /^(?:KiB|MiB|GiB|KB|MB|GB|bytes)$/u.test(token)) {
      parts.push(text.slice(plainStart, start), token); plainStart = position;
    }
  }
  parts.push(text.slice(plainStart));
  return parts;
}
export function replaceVocabulary(text, vocabulary) {
  const original = String(text);
  if (original.length > RENDER_LIMITS.inputCodeUnits) return original;
  const root = compiledTrie(vocabulary);
  const output = [];
  let outputLength = 0, steps = 0;
  const append = value => {
    outputLength += value.length;
    if (outputLength > RENDER_LIMITS.outputCodeUnits) return false;
    output.push(value); return true;
  };
  // Protect factual values and technical examples even within a display label.
  const parts = protectedParts(original);
  for (let partIndex = 0; partIndex < parts.length; partIndex++) {
    const part = parts[partIndex];
    if (partIndex % 2) { if (!append(part)) return original; continue; }
    let position = 0;
    while (position < part.length) {
      let node = root, cursor = position, end = position, replacement;
      while (cursor < part.length) {
        if (++steps > RENDER_LIMITS.trieSteps) return original;
        const character = String.fromCodePoint(part.codePointAt(cursor));
        node = node.children.get(character);
        if (!node) break;
        cursor += character.length;
        if (Object.hasOwn(node, 'replacement')) { replacement = node.replacement; end = cursor; }
      }
      if (replacement !== undefined) {
        if (!append(replacement)) return original;
        position = end;
      } else {
        const character = String.fromCodePoint(part.codePointAt(position));
        if (!append(character)) return original;
        position += character.length;
      }
    }
  }
  return output.join('');
}
export const serializeVocabulary = vocabulary => JSON.stringify({ schemaVersion: 1, entries: Object.fromEntries(vocabulary.replacements.map(({from,to}) => [from,to])) });
export const emptyVocabulary = () => parseVocabulary('{"schemaVersion":1,"entries":{}}');
export function createVocabularyStore(storage, key) {
  let current = emptyVocabulary(), persisted = true;
  try { const source = storage.getItem(key); if (source) current = parseVocabulary(source); }
  catch { persisted = false; try { storage.removeItem(key); } catch {} }
  return {
    get current() { return current; }, get persisted() { return persisted; },
    replace(source) {
      const next = parseVocabulary(source);
      try { storage.setItem(key, serializeVocabulary(next)); persisted = true; }
      catch { persisted = false; try { storage.removeItem(key); } catch {} }
      current = next; return { vocabulary: current, persisted };
    },
    clear() {
      current = emptyVocabulary();
      try { storage.removeItem(key); persisted = true; } catch { persisted = false; }
      return { vocabulary: current, persisted };
    },
  };
}
