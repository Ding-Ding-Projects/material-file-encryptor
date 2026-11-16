/**
 * Pure planning for the Minecraft world generator: request validation, the chunk area, forceload batching, the generated data
 * pack, server.properties and console commands. Nothing here touches the disk, the network or a process.
 */
export const CHUNK_BLOCKS = 16;
export const DEFAULT_CHUNKS = 100;
export const MAX_AXIS_CHUNKS = 1000;
export const MAX_AREA_CHUNKS = 160000;
/** The server rejects /forceload add over more than 256 chunks, so every rectangle stays at 16 by 16 chunks. */
export const MAX_FORCELOAD_CHUNKS = 256;
export const NAMESPACE = 'materialbrowser';
export const MIN_DATA_PACK_JAVA_VERSION = [1, 19];
export const DIFFICULTIES = Object.freeze(['peaceful', 'easy', 'normal', 'hard']);
export const GAME_MODES = Object.freeze(['survival', 'creative', 'adventure', 'spectator']);
export const OUTPUT_KINDS = Object.freeze(['folder', 'zip']);

const ID = /^[a-z0-9_.-]{1,64}$/;
const LEVEL_NAME = /^[A-Za-z0-9][A-Za-z0-9 _.-]{0,59}$/;

/** Java 1.19 and newer only: older versions keep only seed, level type and generate-structures. */
export function supportsWorldPresets(versionId) {
  const classic = /^1\.(\d+)/.exec(String(versionId));
  if (classic) return Number(classic[1]) >= 19;
  return /^(\d{2})\.\d+|^(\d{2})w\d{2}[a-z]/.test(String(versionId));
}

function bool(value, name) { if (typeof value !== 'boolean') throw new Error(name + ' is a yes or no choice.'); return value; }
function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(name + ' must be a whole number from ' + min + ' to ' + max + '.');
  return value;
}

/** Validate a start request. Lists that depend on the version (presets, biomes, game rules) are checked later against the extraction. */
export function validateRequest(request) {
  if (request === null || typeof request !== 'object' || Array.isArray(request)) throw new Error('A generation request is required.');
  const out = {};
  if (typeof request.versionId !== 'string' || !/^[A-Za-z0-9._ -]{1,64}$/.test(request.versionId)) throw new Error('Choose an official version.');
  out.versionId = request.versionId;
  out.seed = String(request.seed ?? '');
  if (out.seed.length > 64 || /[\x00-\x1f]/.test(out.seed)) throw new Error('The seed is at most 64 characters.');
  out.levelName = String(request.levelName ?? 'world');
  if (!LEVEL_NAME.test(out.levelName)) throw new Error('The world folder name uses letters, numbers, spaces, dots, dashes and underscores.');
  out.worldType = String(request.worldType ?? 'normal');
  if (!ID.test(out.worldType)) throw new Error('Choose a world preset from the list.');
  out.widthChunks = integer(request.widthChunks ?? DEFAULT_CHUNKS, 'Width', 1, MAX_AXIS_CHUNKS);
  out.depthChunks = integer(request.depthChunks ?? DEFAULT_CHUNKS, 'Depth', 1, MAX_AXIS_CHUNKS);
  if (out.widthChunks * out.depthChunks > MAX_AREA_CHUNKS) throw new Error('The area is limited to ' + MAX_AREA_CHUNKS + ' chunks.');
  out.centerChunkX = integer(request.centerChunkX ?? 0, 'Center X', -1875000, 1875000);
  out.centerChunkZ = integer(request.centerChunkZ ?? 0, 'Center Z', -1875000, 1875000);
  out.difficulty = String(request.difficulty ?? 'normal');
  if (!DIFFICULTIES.includes(out.difficulty)) throw new Error('Choose a difficulty from the list.');
  out.gamemode = String(request.gamemode ?? 'survival');
  if (!GAME_MODES.includes(out.gamemode)) throw new Error('Choose a game mode from the list.');
  out.hardcore = bool(request.hardcore ?? false, 'Hardcore');
  out.generateStructures = bool(request.generateStructures ?? true, 'Generate structures');
  out.borderFollowsArea = bool(request.borderFollowsArea ?? false, 'World border');
  out.eulaAccepted = bool(request.eulaAccepted ?? false, 'License acceptance');
  const gamerules = request.gamerules ?? {};
  if (gamerules === null || typeof gamerules !== 'object' || Array.isArray(gamerules)) throw new Error('Game rules are an object.');
  out.gamerules = {};
  for (const [name, value] of Object.entries(gamerules)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name)) throw new Error('A game rule name is invalid.');
    if (typeof value !== 'boolean' && !Number.isSafeInteger(value)) throw new Error('Game rule ' + name + ' is a yes or no choice or a whole number.');
    out.gamerules[name] = value;
  }
  const output = request.output ?? {};
  if (!OUTPUT_KINDS.includes(output.kind)) throw new Error('Choose folder or ZIP output.');
  if (typeof output.destinationId !== 'string' || !/^[a-f0-9-]{36}$/.test(output.destinationId)) throw new Error('Choose where to save the world with the Browse button.');
  out.output = {kind: output.kind, destinationId: output.destinationId};
  if (request.tweaks !== undefined) out.tweaks = validateTweaks(request.tweaks);
  return out;
}

/** Typed customization. Anything outside these typed controls is refused, so there is no raw JSON route. */
export function validateTweaks(tweaks) {
  if (tweaks === null || typeof tweaks !== 'object' || Array.isArray(tweaks)) throw new Error('Customization is an object.');
  const out = {};
  if (tweaks.flat !== undefined) {
    const flat = tweaks.flat;
    if (!Array.isArray(flat.layers) || flat.layers.length < 1 || flat.layers.length > 64) throw new Error('A superflat world needs 1 to 64 layers.');
    let total = 0;
    out.flat = {biome: String(flat.biome ?? 'minecraft:plains'), features: bool(flat.features ?? false, 'Features'), lakes: bool(flat.lakes ?? false, 'Lakes'), layers: flat.layers.map(layer => {
      if (typeof layer?.block !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(layer.block)) throw new Error('A layer block must be a block from the registry.');
      const height = integer(layer.height, 'Layer height', 1, 384);
      total += height;
      return {block: layer.block, height};
    })};
    if (!/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(out.flat.biome)) throw new Error('The flat biome must be a biome from the registry.');
    if (total > 384) throw new Error('The layers add up to more than the world height of 384.');
    if (flat.structureSets !== undefined) {
      if (!Array.isArray(flat.structureSets) || flat.structureSets.length > 64 || flat.structureSets.some(item => !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(item))) throw new Error('Structure sets must be registry names.');
      out.flat.structureSets = flat.structureSets;
    }
  }
  if (tweaks.singleBiome !== undefined) {
    if (typeof tweaks.singleBiome !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(tweaks.singleBiome)) throw new Error('The single biome must be a biome from the registry.');
    out.singleBiome = tweaks.singleBiome;
  }
  if (tweaks.noise !== undefined) {
    const noise = tweaks.noise, result = {};
    if (noise.seaLevel !== undefined) result.seaLevel = integer(noise.seaLevel, 'Sea level', -64, 320);
    for (const key of ['aquifers', 'oreVeins', 'mobGeneration']) if (noise[key] !== undefined) result[key] = bool(noise[key], key);
    for (const key of ['defaultBlock', 'defaultFluid']) if (noise[key] !== undefined) {
      if (typeof noise[key] !== 'string' || !/^[a-z0-9_.-]+:[a-z0-9_./-]+$/.test(noise[key])) throw new Error('The ' + key + ' must be a block from the registry.');
      result[key] = noise[key];
    }
    out.noise = result;
  }
  if (tweaks.dimensionType !== undefined) out.dimensionType = validateDimensionType(tweaks.dimensionType);
  return out;
}

/** Height and min_y must be multiples of 16 and logical_height cannot exceed height, or the server stops at load. */
export function validateDimensionType(values) {
  if (values === null || typeof values !== 'object' || Array.isArray(values)) throw new Error('Dimension type tweaks are an object.');
  const out = {};
  const numeric = {height: [16, 4064], min_y: [-2032, 2031], logical_height: [0, 4064]};
  for (const [key, [min, max]] of Object.entries(numeric)) if (values[key] !== undefined) out[key] = integer(values[key], key, min, max);
  for (const key of ['height', 'min_y']) if (out[key] !== undefined && out[key] % 16 !== 0) throw new Error(key + ' must be a multiple of 16.');
  if (out.height !== undefined && out.logical_height !== undefined && out.logical_height > out.height) throw new Error('logical_height cannot exceed height.');
  for (const key of ['natural', 'has_skylight', 'has_ceiling', 'ultrawarm', 'piglin_safe', 'bed_works', 'respawn_anchor_works', 'has_raids']) if (values[key] !== undefined) out[key] = bool(values[key], key);
  if (values.ambient_light !== undefined) {
    if (typeof values.ambient_light !== 'number' || values.ambient_light < 0 || values.ambient_light > 1) throw new Error('ambient_light is between 0 and 1.');
    out.ambient_light = values.ambient_light;
  }
  if (values.coordinate_scale !== undefined) {
    if (typeof values.coordinate_scale !== 'number' || values.coordinate_scale < 0.00001 || values.coordinate_scale > 30000000) throw new Error('coordinate_scale is out of range.');
    out.coordinate_scale = values.coordinate_scale;
  }
  return out;
}

/** The generation rectangle in chunk coordinates, centred on the chosen chunk. */
export function chunkRect({centerChunkX = 0, centerChunkZ = 0, widthChunks, depthChunks}) {
  const minX = centerChunkX - Math.floor(widthChunks / 2), minZ = centerChunkZ - Math.floor(depthChunks / 2);
  return {minChunkX: minX, minChunkZ: minZ, maxChunkX: minX + widthChunks - 1, maxChunkZ: minZ + depthChunks - 1};
}

/** Tile the rectangle with forceload rectangles of at most 256 chunks. Coordinates are block coordinates, as the command expects. */
export function forceloadBatches(rect, maxChunks = MAX_FORCELOAD_CHUNKS) {
  const side = Math.floor(Math.sqrt(maxChunks));
  if (side < 1) throw new Error('The forceload limit is too small.');
  const batches = [];
  for (let z = rect.minChunkZ; z <= rect.maxChunkZ; z += side) {
    for (let x = rect.minChunkX; x <= rect.maxChunkX; x += side) {
      const x2 = Math.min(x + side - 1, rect.maxChunkX), z2 = Math.min(z + side - 1, rect.maxChunkZ);
      const chunks = (x2 - x + 1) * (z2 - z + 1);
      batches.push({chunks, x1: x * CHUNK_BLOCKS, z1: z * CHUNK_BLOCKS, x2: x2 * CHUNK_BLOCKS + CHUNK_BLOCKS - 1, z2: z2 * CHUNK_BLOCKS + CHUNK_BLOCKS - 1});
    }
  }
  return batches;
}

export const forceloadCommand = batch => 'forceload add ' + batch.x1 + ' ' + batch.z1 + ' ' + batch.x2 + ' ' + batch.z2;

/** A rough estimate, labelled as one in the interface. Real progress replaces it as soon as batches finish. */
export function estimate({widthChunks, depthChunks}) {
  const chunks = widthChunks * depthChunks;
  const batches = forceloadBatches(chunkRect({widthChunks, depthChunks})).length;
  return {chunks, blocksX: widthChunks * CHUNK_BLOCKS, blocksZ: depthChunks * CHUNK_BLOCKS, batches, approxSeconds: Math.round(chunks / 25), approxBytes: chunks * 30 * 1024};
}

export const packMcmeta = format => JSON.stringify({pack: {pack_format: format, description: 'Generated by Material File Encryptor'}}, null, 2);

const clone = value => JSON.parse(JSON.stringify(value));

/** Apply typed tweaks to copies of the extracted vanilla files. Returns {files: {relativePath: object}, levelType}. */
export function buildWorldPack({request, basePreset, noiseSettings, dimensionTypes = {}}) {
  const files = {};
  const tweaks = request.tweaks ?? {};
  const preset = clone(basePreset);
  const overworld = preset.dimensions?.['minecraft:overworld'];
  if (!overworld) throw new Error('The chosen world preset has no overworld.');
  if (tweaks.flat) {
    overworld.generator = {type: 'minecraft:flat', settings: {biome: tweaks.flat.biome, features: tweaks.flat.features, lakes: tweaks.flat.lakes, layers: tweaks.flat.layers.map(layer => ({block: layer.block, height: layer.height})), ...(tweaks.flat.structureSets ? {structure_overrides: tweaks.flat.structureSets} : {})}};
  }
  if (tweaks.singleBiome && overworld.generator?.type === 'minecraft:noise') overworld.generator.biome_source = {type: 'minecraft:fixed', biome: tweaks.singleBiome};
  if (tweaks.noise && overworld.generator?.type === 'minecraft:noise') {
    if (!noiseSettings) throw new Error('Noise tweaks need the vanilla noise settings of this version.');
    const settings = clone(noiseSettings);
    const n = tweaks.noise;
    if (n.seaLevel !== undefined) settings.sea_level = n.seaLevel;
    if (n.aquifers !== undefined) settings.aquifers_enabled = n.aquifers;
    if (n.oreVeins !== undefined) settings.ore_veins_enabled = n.oreVeins;
    if (n.mobGeneration !== undefined) settings.disable_mob_generation = !n.mobGeneration;
    if (n.defaultBlock) settings.default_block = {Name: n.defaultBlock};
    if (n.defaultFluid) settings.default_fluid = {Name: n.defaultFluid};
    files['data/' + NAMESPACE + '/worldgen/noise_settings/generated.json'] = settings;
    overworld.generator.settings = NAMESPACE + ':generated';
  }
  if (tweaks.dimensionType) {
    const type = clone(dimensionTypes[String(overworld.type).replace(/^minecraft:/, '')] ?? {});
    Object.assign(type, tweaks.dimensionType);
    files['data/' + NAMESPACE + '/dimension_type/generated.json'] = type;
    overworld.type = NAMESPACE + ':generated';
  }
  files['data/' + NAMESPACE + '/worldgen/world_preset/generated.json'] = preset;
  return {files, levelType: NAMESPACE + ':generated'};
}

/** Does the request need a custom pack, or can level-type name a vanilla preset directly? */
export const needsCustomPack = request => !!request.tweaks && Object.keys(request.tweaks).length > 0;

export function serverProperties({request, port, levelType}) {
  const lines = [
    'server-ip=127.0.0.1', 'server-port=' + port, 'online-mode=false', 'enable-command-block=false', 'spawn-protection=0', 'view-distance=2', 'simulation-distance=2',
    'level-name=' + request.levelName, 'level-seed=' + request.seed, 'level-type=' + levelType, 'generate-structures=' + request.generateStructures,
    'difficulty=' + request.difficulty, 'gamemode=' + request.gamemode, 'hardcore=' + request.hardcore, 'max-players=1', 'motd=Material File Encryptor world generator'
  ];
  for (const line of lines) if (/[\r\n]/.test(line)) throw new Error('A property value contains a line break.');
  return lines.join('\n') + '\n';
}

export const levelTypeFor = (request, custom) => custom ? NAMESPACE + ':generated' : (request.worldType.includes(':') ? request.worldType : 'minecraft:' + request.worldType);

/** Console commands for the typed game rules. The parser type of each rule decides what is accepted. */
export function gameruleCommands(values, definitions) {
  const byName = new Map(definitions.map(row => [row.name, row]));
  const commands = [];
  for (const [name, value] of Object.entries(values)) {
    const rule = byName.get(name);
    if (!rule) throw new Error('This version has no game rule named ' + name + '.');
    if (rule.type === 'bool') { if (typeof value !== 'boolean') throw new Error(name + ' is a yes or no rule.'); }
    else if (rule.type === 'integer') { if (!Number.isSafeInteger(value)) throw new Error(name + ' takes a whole number.'); }
    else throw new Error(name + ' has a type this manager cannot edit yet.');
    commands.push('gamerule ' + name + ' ' + value);
  }
  return commands;
}

export function worldborderCommands(request, rect) {
  if (!request.borderFollowsArea) return [];
  const blocks = Math.max(request.widthChunks, request.depthChunks) * CHUNK_BLOCKS;
  const cx = (rect.minChunkX + rect.maxChunkX + 1) * CHUNK_BLOCKS / 2, cz = (rect.minChunkZ + rect.maxChunkZ + 1) * CHUNK_BLOCKS / 2;
  return ['worldborder center ' + cx + ' ' + cz, 'worldborder set ' + blocks];
}
