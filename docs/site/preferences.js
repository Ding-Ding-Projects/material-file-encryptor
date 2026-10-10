// Local vocabulary contract shared with the desktop preference format.
// This module deliberately has no network or storage access.
export function parseVocabulary(source) {
  if (typeof source !== 'string' || new TextEncoder().encode(source).length > 131072) throw new Error('Vocabulary JSON must be no larger than 128 KB.');
  let value;
  try { value = JSON.parse(source); } catch { throw new Error('Choose a valid JSON file.'); }
  const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
  if (!exact(value, ['version', 'replacements']) || value.version !== 1 || !Array.isArray(value.replacements) || value.replacements.length > 200) throw new Error('Use version 1 and a replacements array with at most 200 entries.');
  const seen = new Set();
  const unsafe = new Set(['__proto__', 'prototype', 'constructor']);
  for (const entry of value.replacements) {
    if (!exact(entry, ['from', 'to']) || typeof entry.from !== 'string' || typeof entry.to !== 'string' || !entry.from.trim() || entry.from.length > 120 || entry.to.length > 500 || /[\u0000-\u001f\u007f-\u009f]/u.test(entry.from + entry.to) || unsafe.has(entry.from) || unsafe.has(entry.to)) throw new Error('Each replacement needs safe from and to strings, with no extra fields or control characters (from: 1–120 characters; to: up to 500).');
    if (seen.has(entry.from)) throw new Error('Duplicate from words are not allowed.');
    seen.add(entry.from);
  }
  return value;
}
export function replaceVocabulary(text, vocabulary) {
  // Match the original text only. Never let replacements cascade into one another.
  const entries = [...vocabulary.replacements].sort((a, b) => b.from.length - a.from.length);
  if (!entries.length) return text;
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(entries.map(entry => escape(entry.from)).join('|'), 'gu');
  const replacements = new Map(entries.map(entry => [entry.from, entry.to]));
  return text.replace(pattern, match => replacements.get(match));
}
export function filterGuides(guides, query) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return guides.filter(guide => terms.every(term => guide.text.toLocaleLowerCase().includes(term)));
}

// Groups never count as searchable entries. A matching image keeps its group and anchor visible.
export function updateGalleryGroups(groups,links) {
 const visibility=new Map();
 for(const group of groups){const visible=[...group.querySelectorAll('.guide')].some(figure=>!figure.hidden);group.hidden=!visible;visibility.set(group.id,visible);}
 for(const link of links)link.hidden=!visibility.get(link.dataset.galleryGroupLink);
}
