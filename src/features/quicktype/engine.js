import quicktypeCore from 'quicktype-core';
import {normalizeLenientJson} from './lenient-json.js';

const {quicktype, InputData, jsonInputForTargetLanguage, JSONSchemaInput, JSONSchemaStore, defaultTargetLanguages, languageNamed} = quicktypeCore;

export const SOURCE_KINDS = Object.freeze(['json', 'schema']);
export const MAX_SOURCE_BYTES = 200 * 1024;
export const MAX_SAMPLES = 8;
export const INFERENCE_SWITCHES = Object.freeze([
  {name: 'inferEnums', defaultValue: true},
  {name: 'inferMaps', defaultValue: true},
  {name: 'inferDateTimes', defaultValue: true},
  {name: 'inferUuids', defaultValue: true},
  {name: 'inferIntegerStrings', defaultValue: true},
  {name: 'inferBooleanStrings', defaultValue: true},
  {name: 'combineClasses', defaultValue: true},
  {name: 'allPropertiesOptional', defaultValue: false}
]);
/** The starter set the interface offers first. Every other language the engine bundles is still listed after these. */
export const PRIMARY_LANGUAGES = Object.freeze(['typescript', 'cs', 'python', 'go', 'rust', 'java', 'swift', 'kotlin']);

/** Schema references are never fetched: the generator makes no network request. */
class OfflineSchemaStore extends JSONSchemaStore {
  async fetch() { return undefined; }
}

function enumValues(option) {
  if (option.values instanceof Map) return [...option.values.keys()];
  if (Array.isArray(option.values)) return option.values;
  return String(option.typeLabel || '').split('|').filter(Boolean);
}

function describeOption(option) {
  const entry = {name: option.name, description: option.description, kind: option.optionType, defaultValue: option.defaultValue};
  if (option.optionType === 'enum') entry.values = enumValues(option);
  if (option.optionType === 'string') entry.typeLabel = option.typeLabel || '';
  return entry;
}

/** The target languages the bundled engine supports, each with every renderer option it defines. */
export function listLanguages() {
  const rows = defaultTargetLanguages.map(language => ({id: language.names[0], name: language.displayName, extension: language.extension, options: language.optionDefinitions.map(describeOption)}));
  const order = id => { const index = PRIMARY_LANGUAGES.indexOf(id); return index < 0 ? PRIMARY_LANGUAGES.length : index; };
  return rows.sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name));
}

export function topLevelName(value) {
  const cleaned = String(value ?? '').replace(/[^A-Za-z0-9_ ]+/g, ' ').trim();
  if (!cleaned) return 'Root';
  return /^[0-9]/.test(cleaned) ? 'T ' + cleaned : cleaned;
}

/** Validate the renderer option bag against the language's own definitions and return string values the engine accepts. */
export function normalizeRendererOptions(language, supplied = {}) {
  const definitions = new Map(language.optionDefinitions.map(option => [option.name, option]));
  const result = {};
  if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('Renderer options must be an object.');
  for (const [name, raw] of Object.entries(supplied)) {
    const option = definitions.get(name);
    if (!option) throw new Error('Unknown renderer option for this language: ' + name);
    if (option.optionType === 'boolean') {
      if (typeof raw !== 'boolean') throw new Error('Option ' + name + ' takes a boolean.');
      result[name] = String(raw);
    } else if (option.optionType === 'enum') {
      const legal = enumValues(option);
      if (typeof raw !== 'string' || !legal.includes(raw)) throw new Error('Option ' + name + ' takes one of: ' + legal.join(', '));
      result[name] = raw;
    } else {
      if (typeof raw !== 'string' || raw.length > 200 || /[\x00-\x1f]/.test(raw)) throw new Error('Option ' + name + ' takes a short text value.');
      result[name] = raw;
    }
  }
  return result;
}

function checkSources(sources) {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > MAX_SAMPLES) throw new Error('Between 1 and ' + MAX_SAMPLES + ' sources are required.');
  let total = 0;
  for (const text of sources) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Every source must be non-empty text.');
    total += Buffer.byteLength(text);
  }
  if (total > MAX_SOURCE_BYTES) throw new Error('The sources exceed the ' + MAX_SOURCE_BYTES + ' byte limit.');
}

/**
 * Generate typed code. sourceKind json takes one or more samples of the same shape; schema takes one JSON Schema document.
 * Returns {code, language, extension, warnings}. A malformed source raises an Error whose message names the problem.
 */
export async function generate({sourceKind = 'json', sources, name = 'Root', language = 'typescript', rendererOptions = {}, inference = {}, lenient = true} = {}) {
  if (!SOURCE_KINDS.includes(sourceKind)) throw new Error('Unsupported source kind.');
  checkSources(sources);
  let target;
  try { target = languageNamed(language); } catch { target = undefined; }
  if (!target) throw new Error('Unsupported target language.');
  const options = normalizeRendererOptions(target, rendererOptions);
  const topLevel = topLevelName(name);
  const warnings = [];
  const texts = sources.map((text, index) => {
    try {
      if (!lenient) { JSON.parse(text); return text; }
      return normalizeLenientJson(text);
    } catch (error) {
      throw new Error('Source ' + (index + 1) + ' is not valid JSON: ' + error.message);
    }
  });
  if (lenient && texts.some((text, index) => text !== sources[index])) warnings.push('Comments or trailing commas were removed before inference.');
  const input = new InputData();
  if (sourceKind === 'json') {
    const jsonInput = jsonInputForTargetLanguage(language);
    await jsonInput.addSource({name: topLevel, samples: texts});
    input.addInput(jsonInput);
  } else {
    if (texts.length !== 1) throw new Error('Exactly one JSON Schema document is required.');
    const schemaInput = new JSONSchemaInput(new OfflineSchemaStore());
    await schemaInput.addSource({name: topLevel, schema: texts[0]});
    input.addInput(schemaInput);
  }
  const flags = {};
  for (const item of INFERENCE_SWITCHES) {
    const value = inference[item.name];
    if (value !== undefined && typeof value !== 'boolean') throw new Error('Inference switch ' + item.name + ' takes a boolean.');
    flags[item.name] = value ?? item.defaultValue;
  }
  const result = await quicktype({inputData: input, lang: language, rendererOptions: options, ...flags});
  return {code: result.lines.join('\n'), language: target.displayName, languageId: language, extension: target.extension, warnings};
}
