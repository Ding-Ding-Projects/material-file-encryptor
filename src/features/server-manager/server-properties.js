/** Validated editing of `server.properties`.
 *
 * Only keys in the schema can be changed, every value is checked against its type and bounds, and writing preserves comments,
 * ordering and every key the schema does not know. Security-sensitive keys (RCON, the bind address, resource pack and level
 * path keys) are deliberately not editable here. */
const text = max => ({type: 'string', max});
export const SERVER_PROPERTY_SCHEMA = Object.freeze({
  'server-port': {type: 'integer', min: 1024, max: 65535, targets: ['local-process', 'ssh-process'], apply: 'restart'},
  motd: {...text(59), apply: 'restart'},
  'max-players': {type: 'integer', min: 1, max: 1000, apply: 'restart'},
  difficulty: {type: 'enum', choices: ['peaceful', 'easy', 'normal', 'hard'], apply: 'restart'},
  gamemode: {type: 'enum', choices: ['survival', 'creative', 'adventure', 'spectator'], apply: 'restart'},
  'online-mode': {type: 'boolean', apply: 'restart'},
  'view-distance': {type: 'integer', min: 3, max: 32, apply: 'restart'},
  'simulation-distance': {type: 'integer', min: 3, max: 32, apply: 'restart'},
  pvp: {type: 'boolean', apply: 'restart'},
  hardcore: {type: 'boolean', apply: 'restart'},
  'white-list': {type: 'boolean', apply: 'restart'},
  'allow-flight': {type: 'boolean', apply: 'restart'},
  'allow-nether': {type: 'boolean', apply: 'restart'},
  'spawn-protection': {type: 'integer', min: 0, max: 256, apply: 'restart'},
  'spawn-monsters': {type: 'boolean', apply: 'restart'},
  'spawn-animals': {type: 'boolean', apply: 'restart'},
  'spawn-npcs': {type: 'boolean', apply: 'restart'},
  'enable-command-block': {type: 'boolean', apply: 'restart'},
  'force-gamemode': {type: 'boolean', apply: 'restart'},
});
export const SETTING_KEYS = Object.freeze(Object.keys(SERVER_PROPERTY_SCHEMA));

export function describeSettings(target) {
  return SETTING_KEYS.filter(key => !SERVER_PROPERTY_SCHEMA[key].targets || SERVER_PROPERTY_SCHEMA[key].targets.includes(target)).map(key => ({key, ...SERVER_PROPERTY_SCHEMA[key]}));
}

/** Returns the canonical text form of a value or throws. `value` may arrive as a boolean, a safe integer or a string. */
export function validateSetting(key, value, target = 'local-process') {
  if (typeof key !== 'string' || !Object.hasOwn(SERVER_PROPERTY_SCHEMA, key)) throw Error('This server setting is not editable.');
  const rule = SERVER_PROPERTY_SCHEMA[key];
  if (rule.targets && !rule.targets.includes(target)) throw Error('This setting is fixed when the container is created.');
  if (rule.type === 'boolean') { if (typeof value !== 'boolean') throw Error('Invalid server setting value.'); return value ? 'true' : 'false'; }
  if (rule.type === 'integer') { if (!Number.isSafeInteger(value) || value < rule.min || value > rule.max) throw Error('Invalid server setting value.'); return String(value); }
  if (rule.type === 'enum') { if (typeof value !== 'string' || !rule.choices.includes(value)) throw Error('Invalid server setting value.'); return value; }
  // Free text. Control characters, backslashes (Java properties escapes) and the properties syntax characters = # ! are refused outright.
  if (typeof value !== 'string' || value.length > rule.max || /[\u0000-\u001f\u007f-\u009f\\=#!]/.test(value)) throw Error('Invalid server setting value.');
  return value;
}

/** Parses the editable keys out of the file text. Unknown keys are ignored; comments are skipped. */
export function readSettings(source) {
  const values = {};
  for (const line of String(source).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9._-]+)=(.*)$/.exec(line);
    if (match && Object.hasOwn(SERVER_PROPERTY_SCHEMA, match[1])) values[match[1]] = match[2];
  }
  return values;
}

/** Rewrites exactly one key, keeping every other line byte for byte. Appends the key when it was absent. */
export function applySetting(source, key, value, target) {
  const canonical = validateSetting(key, value, target);
  const eol = String(source).includes('\r\n') ? '\r\n' : '\n';
  const lines = String(source).split(/\r?\n/);
  let replaced = false;
  const next = lines.map(line => { const match = /^([A-Za-z0-9._-]+)=/.exec(line); if (match && match[1] === key) { replaced = true; return key + '=' + canonical; } return line; });
  if (!replaced) { if (next.length && next.at(-1) === '') next.splice(next.length - 1, 0, key + '=' + canonical); else next.push(key + '=' + canonical); }
  const out = next.join(eol);
  return out.endsWith(eol) ? out : out + eol;
}
