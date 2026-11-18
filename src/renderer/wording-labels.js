// A personal wording file is written against the English source text of each label. This mapper answers one
// question: does the file map this exact label? When it does, that wording wins in every display language,
// so a label never falls back to a translation that the file could not have named.
export function createWholeLabelMapper({ getVocabulary, isActive }) {
  const cache = new WeakMap();
  return function mappedWholeLabel(source) {
    try {
      if (typeof source !== 'string' || !isActive()) return undefined;
      const vocabulary = getVocabulary();
      if (!vocabulary?.replacements?.length) return undefined;
      let map = cache.get(vocabulary);
      if (!map) { map = new Map(vocabulary.replacements.map(entry => [entry.from, entry.to])); cache.set(vocabulary, map); }
      return map.get(source);
    } catch { return undefined; }
  };
}
