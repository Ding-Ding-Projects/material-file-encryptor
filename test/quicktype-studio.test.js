import test from 'node:test';
import assert from 'node:assert/strict';
import {stripLenientJson, normalizeLenientJson} from '../src/features/quicktype/lenient-json.js';
import {generate, listLanguages, normalizeRendererOptions, topLevelName, PRIMARY_LANGUAGES} from '../src/features/quicktype/engine.js';
import {createQuicktypeService} from '../src/features/quicktype/service.js';
import {validateFeatureRequest} from '../src/main/validation.js';

const sample = '{"name":"Ada","age":36,"tags":["a","b"],"home":{"city":"London"},"note":null}';

test('lenient JSON drops comments and trailing commas but never touches strings', () => {
  const text = '{\n // line\n "a": "http://x // not a comment", /* block */ "b": [1,2,],\n}';
  const strict = normalizeLenientJson(text);
  assert.deepEqual(JSON.parse(strict), {a: 'http://x // not a comment', b: [1, 2]});
  assert.throws(() => stripLenientJson('/* open'), /Unterminated/);
  assert.throws(() => normalizeLenientJson('{"a":}'), SyntaxError);
});

test('every primary language is offered first and carries real renderer option definitions', () => {
  const rows = listLanguages();
  assert.deepEqual(rows.slice(0, PRIMARY_LANGUAGES.length).map(row => row.id), [...PRIMARY_LANGUAGES]);
  assert.ok(rows.length >= 20);
  const cs = rows.find(row => row.id === 'cs');
  assert.ok(cs.options.some(option => option.name === 'namespace' && option.kind === 'string'));
  assert.ok(cs.options.some(option => option.kind === 'enum' && option.values.length >= 2));
  assert.ok(cs.options.some(option => option.kind === 'boolean'));
});

test('JSON samples generate typed code for each required target language', async () => {
  const expectations = {
    typescript: /interface Person[\s\S]*age:\s+number/,
    cs: /class Person[\s\S]*Age/,
    python: /class Person|@dataclass/,
    go: /type Person struct/,
    rust: /struct Person/,
    java: /class Person/,
    swift: /struct Person/,
    kotlin: /class Person/
  };
  for (const [language, pattern] of Object.entries(expectations)) {
    const result = await generate({sources: [sample], name: 'Person', language});
    assert.match(result.code, pattern, language);
    assert.ok(result.extension);
  }
});

test('naming, renderer options and the all-optional nullability switch change the output', async () => {
  const plain = await generate({sources: [sample], name: 'Person', language: 'typescript', rendererOptions: {'just-types': true}});
  assert.ok(!/JSON\.parse|Convert/.test(plain.code));
  const renamed = await generate({sources: [sample], name: 'my record', language: 'typescript', rendererOptions: {'just-types': true}});
  assert.match(renamed.code, /MyRecord/);
  const optional = await generate({sources: [sample], name: 'Person', language: 'typescript', rendererOptions: {'just-types': true}, inference: {allPropertiesOptional: true}});
  assert.match(optional.code, /name\?:/);
  const namespaced = await generate({sources: [sample], name: 'Person', language: 'cs', rendererOptions: {namespace: 'Acme.Models'}});
  assert.match(namespaced.code, /namespace Acme\.Models/);
});

test('JSON Schema input generates code and never fetches a referenced schema', async () => {
  const schema = JSON.stringify({type: 'object', properties: {id: {type: 'integer'}, ref: {$ref: 'https://example.invalid/other.json'}}, required: ['id']});
  await assert.rejects(() => generate({sourceKind: 'schema', sources: [schema], name: 'Item', language: 'go'}));
  const local = JSON.stringify({type: 'object', properties: {id: {type: 'integer'}, label: {type: 'string'}}, required: ['id']});
  const result = await generate({sourceKind: 'schema', sources: [local], name: 'Item', language: 'go'});
  assert.match(result.code, /type Item struct/);
});

test('invalid input is refused with a specific message', async () => {
  await assert.rejects(() => generate({sources: ['{"a":'], language: 'go'}), /not valid JSON/);
  await assert.rejects(() => generate({sources: [], language: 'go'}), /sources are required/);
  await assert.rejects(() => generate({sources: [sample], language: 'nope'}), /Unsupported target language/);
  await assert.rejects(() => generate({sources: [sample], language: 'go', rendererOptions: {bogus: true}}), /Unknown renderer option/);
  await assert.rejects(() => generate({sources: ['x'.repeat(300 * 1024)], language: 'go'}), /byte limit/);
  await assert.rejects(() => generate({sources: [sample], language: 'typescript', inference: {inferMaps: 'yes'}}), /takes a boolean/);
});

test('the top-level name is always a usable identifier seed', () => {
  assert.equal(topLevelName(''), 'Root');
  assert.equal(topLevelName('9 lives'), 'T 9 lives');
  assert.equal(topLevelName('a;b'), 'a b');
});

test('option validation checks the language definition', () => {
  const definition = {optionDefinitions: [{name: 'flag', optionType: 'boolean'}, {name: 'mode', optionType: 'enum', values: new Map([['a', 1], ['b', 2]])}, {name: 'ns', optionType: 'string'}]};
  assert.deepEqual(normalizeRendererOptions(definition, {flag: true, mode: 'b', ns: 'X'}), {flag: 'true', mode: 'b', ns: 'X'});
  assert.throws(() => normalizeRendererOptions(definition, {mode: 'c'}), /one of/);
  assert.throws(() => normalizeRendererOptions(definition, {ns: 'a\nb'}), /short text/);
});

test('the host service dispatches only its two actions and rejects malformed payloads', async () => {
  const service = createQuicktypeService();
  const listing = await service.dispatch('languages', {});
  assert.ok(listing.languages.length >= 20 && listing.inference.length >= 6);
  const result = await service.dispatch('generate', {sources: [sample], name: 'P', language: 'rust'});
  assert.match(result.code, /struct P/);
  await assert.rejects(() => service.dispatch('generate', {sources: [sample], extra: 1}), /Unsupported type generator request/);
  await assert.rejects(() => service.dispatch('generate', {sources: [sample], rendererOptions: []}), /must be an object/);
  await assert.rejects(() => service.dispatch('reset', {}), /Unsupported type generator action/);
});

test('the feature request validator admits the generator actions', () => {
  validateFeatureRequest('quicktype', 'languages', {});
  validateFeatureRequest('quicktype', 'generate', {sources: [sample]});
  assert.throws(() => validateFeatureRequest('quicktype', 'format', {}), /Unsupported feature request/);
});
