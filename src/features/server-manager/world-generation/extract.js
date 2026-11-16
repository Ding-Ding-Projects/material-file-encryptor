import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Per-version discovery. Lists, fields and pack formats change between versions, so nothing here is a hardcoded list: every picker
 * is read from the output of the data generator that ships inside the exact server jar the person chose.
 */
const MAX_JSON_BYTES = 12 * 1024 * 1024;

export const DATA_FOLDERS = Object.freeze({
  biomes: 'worldgen/biome',
  structureSets: 'worldgen/structure_set',
  worldPresets: 'worldgen/world_preset',
  flatPresets: 'worldgen/flat_level_generator_preset',
  noiseSettings: 'worldgen/noise_settings',
  dimensionTypes: 'dimension_type'
});

/** The data generator command line. It never starts a server and needs no license acceptance. */
export function generatorArguments({jarPath, outputDirectory}) {
  return ['-DbundlerMainClass=net.minecraft.data.Main', '-jar', jarPath, '--server', '--reports', '--output', outputDirectory];
}

export function parseGamerules(commandsJson) {
  const children = commandsJson?.children?.gamerule?.children;
  if (!children || typeof children !== 'object') return [];
  return Object.entries(children).map(([name, node]) => {
    const parser = node?.children?.value?.parser;
    const type = parser === 'brigadier:bool' ? 'bool' : parser === 'brigadier:integer' ? 'integer' : 'unknown';
    return {name, type, parser: parser ?? null};
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export function parseRegistryIds(registriesJson, registry) {
  const entries = registriesJson?.[registry]?.entries;
  return entries && typeof entries === 'object' ? Object.keys(entries).sort() : [];
}

export function parsePackFormat(versionJson) {
  const pack = versionJson?.pack_version;
  const value = typeof pack === 'object' ? pack?.data ?? pack?.data_major : pack;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

async function readJson(file) {
  const stat = await fs.lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > MAX_JSON_BYTES) throw new Error('A report file is missing or too large.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function stems(directory) {
  try {
    const entries = await fs.readdir(directory, {withFileTypes: true});
    return entries.filter(entry => entry.isFile() && entry.name.endsWith('.json')).map(entry => entry.name.slice(0, -5)).sort();
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Read the picker lists from a data generator output folder. A list the generator did not produce is reported as a gap with its
 * reason and left empty; it is never filled from a built-in table.
 */
export async function readExtraction({outputDirectory, versionJson = null}) {
  const dataRoot = path.join(outputDirectory, 'data', 'minecraft');
  const result = {gaps: [], versionId: versionJson?.id ?? null, packFormat: parsePackFormat(versionJson)};
  for (const [key, folder] of Object.entries(DATA_FOLDERS)) {
    const list = await stems(path.join(dataRoot, folder));
    if (list === null) { result[key] = []; result.gaps.push({key, reason: 'The data generator did not write data/minecraft/' + folder + ' for this version.'}); }
    else result[key] = list.map(stem => 'minecraft:' + stem);
  }
  try { result.gamerules = parseGamerules(await readJson(path.join(outputDirectory, 'reports', 'commands.json'))); }
  catch { result.gamerules = []; result.gaps.push({key: 'gamerules', reason: 'reports/commands.json was not produced for this version.'}); }
  try { result.blocks = parseRegistryIds(await readJson(path.join(outputDirectory, 'reports', 'registries.json')), 'minecraft:block'); }
  catch { result.blocks = []; result.gaps.push({key: 'blocks', reason: 'reports/registries.json was not produced for this version.'}); }
  if (result.packFormat === null) result.gaps.push({key: 'packFormat', reason: 'The data pack format is unknown for this version, so custom customization is unavailable.'});
  return result;
}

/** Read the vanilla JSON files a tweak starts from. */
export async function readBase({outputDirectory, preset}) {
  const dataRoot = path.join(outputDirectory, 'data', 'minecraft');
  const name = String(preset).replace(/^minecraft:/, '');
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('Choose a world preset from the list.');
  const basePreset = await readJson(path.join(dataRoot, DATA_FOLDERS.worldPresets, name + '.json'));
  let noiseSettings = null;
  try { noiseSettings = await readJson(path.join(dataRoot, DATA_FOLDERS.noiseSettings, 'overworld.json')); } catch { /* noise tweaks report the gap */ }
  const dimensionTypes = {};
  for (const type of ['overworld', 'the_nether', 'the_end']) {
    try { dimensionTypes[type] = await readJson(path.join(dataRoot, DATA_FOLDERS.dimensionTypes, type + '.json')); } catch { /* optional */ }
  }
  return {basePreset, noiseSettings, dimensionTypes};
}

/** Version-bound limits a request must respect, derived from the extraction. */
export function checkAgainstExtraction(request, extraction) {
  if (!extraction.worldPresets.length) throw new Error('This version has no world presets to choose from yet. Extract its options first.');
  const preset = request.worldType.includes(':') ? request.worldType : 'minecraft:' + request.worldType;
  if (!extraction.worldPresets.includes(preset)) throw new Error('This version has no world preset named ' + request.worldType + '.');
  const tweaks = request.tweaks ?? {};
  if (Object.keys(tweaks).length && extraction.packFormat === null) throw new Error('Customization needs this version\'s data pack format, which could not be read.');
  const needBiome = [tweaks.flat?.biome, tweaks.singleBiome].filter(Boolean);
  for (const biome of needBiome) if (!extraction.biomes.includes(biome)) throw new Error('This version has no biome named ' + biome + '.');
  for (const layer of tweaks.flat?.layers ?? []) if (extraction.blocks.length && !extraction.blocks.includes(layer.block)) throw new Error('This version has no block named ' + layer.block + '.');
  for (const set of tweaks.flat?.structureSets ?? []) if (!extraction.structureSets.includes(set)) throw new Error('This version has no structure set named ' + set + '.');
  return preset;
}
