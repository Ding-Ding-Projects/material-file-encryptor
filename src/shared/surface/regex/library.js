// Parameterized reuse for saved expressions: {{name}} or {{name|default}} placeholders inside a
// saved pattern are replaced by values escaped as literal text, so a value can never change the
// structure of the expression.
import { escapeLiteral } from './tokens.js';

const PLACEHOLDER = /\{\{([A-Za-z_][A-Za-z0-9_]*)(?:\|([^{}]*))?\}\}/g;

export function listParameters(pattern) {
  const found = new Map();
  for (const m of String(pattern).matchAll(PLACEHOLDER)) if (!found.has(m[1])) found.set(m[1], m[2] ?? '');
  return [...found].map(([name, fallback]) => ({ name, default: fallback }));
}

export function applyParameters(pattern, values = {}) {
  return String(pattern).replace(PLACEHOLDER, (_, name, fallback) => escapeLiteral(Object.hasOwn(values, name) && values[name] !== '' ? values[name] : (fallback ?? '')));
}

export function exportCollection(entries) {
  return JSON.stringify({ version: 1, snippets: entries }, null, 2);
}
