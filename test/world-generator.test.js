import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {spawnSync} from 'node:child_process';
import zlib from 'node:zlib';
import {validateRequest, validateTweaks, validateDimensionType, chunkRect, forceloadBatches, forceloadCommand, estimate, buildWorldPack, needsCustomPack, serverProperties, gameruleCommands, worldborderCommands, supportsWorldPresets, DEFAULT_CHUNKS, MAX_FORCELOAD_CHUNKS, NAMESPACE} from '../src/features/server-manager/world-generation/plan.js';
import {parseGamerules, parseRegistryIds, parsePackFormat, readExtraction, checkAgainstExtraction, generatorArguments} from '../src/features/server-manager/world-generation/extract.js';
import {writeZip, readZipDirectory, listTree} from '../src/features/server-manager/world-generation/zip-writer.js';
import {createWorldGenerator, downloadVerified, WORLD_ACTIONS} from '../src/features/server-manager/world-generation/generator.js';
import {validateFeatureRequest} from '../src/main/validation.js';

const temp = () => fs.mkdtemp(path.join(os.tmpdir(), 'mfe-world-'));
const ID = '11111111-1111-4111-8111-111111111111';
const base = (extra = {}) => ({versionId: '1.21.4', output: {kind: 'folder', destinationId: ID}, ...extra});

test('the default area is 100 by 100 chunks and every forceload batch stays within 256 chunks', () => {
  const request = validateRequest(base());
  assert.equal(request.widthChunks, DEFAULT_CHUNKS);
  assert.equal(request.depthChunks, DEFAULT_CHUNKS);
  const rect = chunkRect(request);
  assert.deepEqual(rect, {minChunkX: -50, minChunkZ: -50, maxChunkX: 49, maxChunkZ: 49});
  const batches = forceloadBatches(rect);
  assert.equal(batches.length, 49, '7 by 7 rectangles cover 100 by 100 chunks');
  assert.ok(batches.every(batch => batch.chunks <= MAX_FORCELOAD_CHUNKS));
  assert.equal(batches.reduce((sum, batch) => sum + batch.chunks, 0), 10000, 'the batches cover every chunk exactly once');
  assert.equal(estimate({widthChunks: 100, depthChunks: 100}).blocksX, 1600);
  assert.match(forceloadCommand(batches[0]), /^forceload add -800 -800 -545 -545$/);
});

test('batches tile an odd rectangle without overlap or gaps', () => {
  const rect = chunkRect({centerChunkX: 3, centerChunkZ: -7, widthChunks: 37, depthChunks: 21});
  const seen = new Set();
  for (const batch of forceloadBatches(rect)) {
    for (let x = batch.x1 / 16; x <= (batch.x2 - 15) / 16; x++) for (let z = batch.z1 / 16; z <= (batch.z2 - 15) / 16; z++) { const key = x + ',' + z; assert.ok(!seen.has(key), 'no overlap'); seen.add(key); }
  }
  assert.equal(seen.size, 37 * 21);
  assert.throws(() => forceloadBatches(rect, 0), /too small/);
});

test('requests are validated before anything runs', () => {
  assert.throws(() => validateRequest(base({versionId: '../x'})), /official version/);
  assert.throws(() => validateRequest(base({widthChunks: 0})), /Width/);
  assert.throws(() => validateRequest(base({widthChunks: 1000, depthChunks: 1000})), /limited to/);
  assert.throws(() => validateRequest(base({seed: 'x'.repeat(65)})), /seed/);
  assert.throws(() => validateRequest(base({levelName: '../evil'})), /folder name/);
  assert.throws(() => validateRequest(base({difficulty: 'impossible'})), /difficulty/);
  assert.throws(() => validateRequest(base({output: {kind: 'tar', destinationId: ID}})), /folder or ZIP/);
  assert.throws(() => validateRequest(base({output: {kind: 'zip', destinationId: 'C:\\anywhere'}})), /Browse button/);
  assert.throws(() => validateRequest(base({gamerules: {'bad name': true}})), /invalid/);
  assert.throws(() => validateRequest(base({gamerules: {doFireTick: 'yes'}})), /yes or no/);
  assert.throws(() => validateRequest(base({eulaAccepted: 'yes'})), /yes or no/);
  assert.equal(validateRequest(base({eulaAccepted: true})).eulaAccepted, true);
  assert.equal(validateRequest(base()).eulaAccepted, false, 'the license is never accepted by default');
});

test('versions before 1.19 keep only seed, level type and structures', () => {
  assert.equal(supportsWorldPresets('1.18.2'), false);
  assert.equal(supportsWorldPresets('1.19'), true);
  assert.equal(supportsWorldPresets('1.21.4'), true);
  assert.equal(supportsWorldPresets('26.1'), true);
  assert.equal(supportsWorldPresets('b1.7.3'), false);
});

test('typed tweaks reject what the server would refuse to load', () => {
  assert.throws(() => validateTweaks({flat: {layers: []}}), /1 to 64 layers/);
  assert.throws(() => validateTweaks({flat: {layers: [{block: 'stone', height: 1}]}}), /registry/);
  assert.throws(() => validateTweaks({flat: {layers: [{block: 'minecraft:stone', height: 300}, {block: 'minecraft:dirt', height: 100}]}}), /more than the world height/);
  assert.throws(() => validateTweaks({noise: {seaLevel: 999}}), /Sea level/);
  assert.throws(() => validateDimensionType({height: 100}), /multiple of 16/);
  assert.throws(() => validateDimensionType({min_y: -60}), /multiple of 16/);
  assert.throws(() => validateDimensionType({height: 256, logical_height: 512}), /cannot exceed height/);
  assert.throws(() => validateDimensionType({ambient_light: 2}), /between 0 and 1/);
  assert.deepEqual(validateDimensionType({height: 384, min_y: -64, logical_height: 384, natural: true}), {height: 384, min_y: -64, logical_height: 384, natural: true});
});

test('unknown tweak keys never reach the pack', () => {
  assert.deepEqual(validateTweaks({rawJson: {evil: true}}), {});
});

test('tweaks build a data pack from copies of the extracted vanilla files', () => {
  const basePreset = {dimensions: {'minecraft:overworld': {type: 'minecraft:overworld', generator: {type: 'minecraft:noise', biome_source: {type: 'minecraft:multi_noise', preset: 'minecraft:overworld'}, settings: 'minecraft:overworld'}}}};
  const noiseSettings = {sea_level: 63, aquifers_enabled: true, ore_veins_enabled: true, disable_mob_generation: false};
  const request = validateRequest(base({tweaks: {singleBiome: 'minecraft:plains', noise: {seaLevel: 40, oreVeins: false, mobGeneration: false}, dimensionType: {height: 256, logical_height: 256}}}));
  const before = JSON.stringify(basePreset);
  const pack = buildWorldPack({request, basePreset, noiseSettings, dimensionTypes: {overworld: {height: 384, natural: true}}});
  assert.equal(JSON.stringify(basePreset), before, 'the extracted file is never mutated');
  const preset = pack.files['data/' + NAMESPACE + '/worldgen/world_preset/generated.json'];
  assert.deepEqual(preset.dimensions['minecraft:overworld'].generator.biome_source, {type: 'minecraft:fixed', biome: 'minecraft:plains'});
  assert.equal(preset.dimensions['minecraft:overworld'].generator.settings, NAMESPACE + ':generated');
  assert.equal(preset.dimensions['minecraft:overworld'].type, NAMESPACE + ':generated');
  const noise = pack.files['data/' + NAMESPACE + '/worldgen/noise_settings/generated.json'];
  assert.deepEqual([noise.sea_level, noise.ore_veins_enabled, noise.disable_mob_generation, noise.aquifers_enabled], [40, false, true, true]);
  assert.equal(pack.files['data/' + NAMESPACE + '/dimension_type/generated.json'].height, 256);
  assert.equal(pack.levelType, NAMESPACE + ':generated');
  assert.equal(needsCustomPack(request), true);
  assert.equal(needsCustomPack(validateRequest(base())), false);
});

test('a flat world replaces the generator with typed layers', () => {
  const basePreset = {dimensions: {'minecraft:overworld': {type: 'minecraft:overworld', generator: {type: 'minecraft:noise'}}}};
  const request = validateRequest(base({tweaks: {flat: {biome: 'minecraft:desert', features: false, lakes: true, layers: [{block: 'minecraft:bedrock', height: 1}, {block: 'minecraft:sandstone', height: 3}]}}}));
  const generator = buildWorldPack({request, basePreset}).files['data/' + NAMESPACE + '/worldgen/world_preset/generated.json'].dimensions['minecraft:overworld'].generator;
  assert.equal(generator.type, 'minecraft:flat');
  assert.deepEqual(generator.settings.layers.map(layer => layer.height), [1, 3]);
  assert.equal(generator.settings.biome, 'minecraft:desert');
  assert.throws(() => buildWorldPack({request: validateRequest(base({tweaks: {noise: {seaLevel: 10}}})), basePreset: {dimensions: {'minecraft:overworld': {type: 'minecraft:overworld', generator: {type: 'minecraft:noise'}}}}}), /vanilla noise settings/);
});

test('server.properties and console commands come from typed values only', () => {
  const request = validateRequest(base({seed: 'hello world', levelName: 'my world', hardcore: true, difficulty: 'hard', borderFollowsArea: true}));
  const text = serverProperties({request, port: 25999, levelType: 'minecraft:normal'});
  for (const line of ['server-ip=127.0.0.1', 'server-port=25999', 'level-seed=hello world', 'level-name=my world', 'level-type=minecraft:normal', 'hardcore=true', 'difficulty=hard']) assert.ok(text.includes(line + '\n'), line);
  assert.throws(() => serverProperties({request: {...request, seed: 'a\nop=1'}, port: 1, levelType: 'x'}), /line break/);
  const definitions = [{name: 'doDaylightCycle', type: 'bool'}, {name: 'randomTickSpeed', type: 'integer'}, {name: 'mystery', type: 'unknown'}];
  assert.deepEqual(gameruleCommands({doDaylightCycle: false, randomTickSpeed: 6}, definitions), ['gamerule doDaylightCycle false', 'gamerule randomTickSpeed 6']);
  assert.throws(() => gameruleCommands({nope: true}, definitions), /no game rule named nope/);
  assert.throws(() => gameruleCommands({doDaylightCycle: 3}, definitions), /yes or no/);
  assert.throws(() => gameruleCommands({mystery: true}, definitions), /cannot edit/);
  assert.deepEqual(worldborderCommands(request, chunkRect(request)), ['worldborder center 0 0', 'worldborder set 1600']);
});

test('report parsers read typed game rules, registries and the pack format from the jar output', () => {
  const rules = parseGamerules({children: {gamerule: {children: {doFireTick: {children: {value: {parser: 'brigadier:bool'}}}, randomTickSpeed: {children: {value: {parser: 'brigadier:integer'}}}, odd: {children: {value: {parser: 'brigadier:float'}}}}}}});
  assert.deepEqual(rules.map(rule => [rule.name, rule.type]), [['doFireTick', 'bool'], ['odd', 'unknown'], ['randomTickSpeed', 'integer']]);
  assert.deepEqual(parseRegistryIds({'minecraft:block': {entries: {'minecraft:stone': {}, 'minecraft:air': {}}}}, 'minecraft:block'), ['minecraft:air', 'minecraft:stone']);
  assert.equal(parsePackFormat({pack_version: {data: 61}}), 61);
  assert.equal(parsePackFormat({pack_version: 18}), 18);
  assert.equal(parsePackFormat({}), null);
  assert.ok(generatorArguments({jarPath: 'server.jar', outputDirectory: 'out'}).includes('-DbundlerMainClass=net.minecraft.data.Main'));
});

async function fakeGeneratorOutput(output, {withWorldgen = true} = {}) {
  const put = async (relative, value) => { const file = path.join(output, ...relative.split('/')); await fs.mkdir(path.dirname(file), {recursive: true}); await fs.writeFile(file, JSON.stringify(value)); };
  if (withWorldgen) {
    for (const stem of ['plains', 'desert']) await put('data/minecraft/worldgen/biome/' + stem + '.json', {});
    for (const stem of ['normal', 'flat', 'large_biomes']) await put('data/minecraft/worldgen/world_preset/' + stem + '.json', {dimensions: {'minecraft:overworld': {type: 'minecraft:overworld', generator: {type: 'minecraft:noise'}}}});
    await put('data/minecraft/worldgen/structure_set/villages.json', {});
    await put('data/minecraft/worldgen/flat_level_generator_preset/classic_flat.json', {});
    await put('data/minecraft/worldgen/noise_settings/overworld.json', {sea_level: 63});
    await put('data/minecraft/dimension_type/overworld.json', {height: 384});
  }
  await put('reports/commands.json', {children: {gamerule: {children: {doDaylightCycle: {children: {value: {parser: 'brigadier:bool'}}}}}}});
  await put('reports/registries.json', {'minecraft:block': {entries: {'minecraft:stone': {}, 'minecraft:bedrock': {}}}});
}

test('extraction fills every picker from the generator output and reports gaps instead of inventing lists', async () => {
  const directory = await temp();
  await fakeGeneratorOutput(directory);
  const options = await readExtraction({outputDirectory: directory, versionJson: {id: '1.21.4', pack_version: {data: 61}}});
  assert.deepEqual(options.worldPresets, ['minecraft:flat', 'minecraft:large_biomes', 'minecraft:normal']);
  assert.deepEqual(options.biomes, ['minecraft:desert', 'minecraft:plains']);
  assert.equal(options.packFormat, 61);
  assert.deepEqual(options.gaps, []);
  const bare = await temp();
  await fakeGeneratorOutput(bare, {withWorldgen: false});
  const gaps = await readExtraction({outputDirectory: bare, versionJson: null});
  assert.deepEqual(gaps.worldPresets, [], 'no built-in fallback list');
  assert.ok(gaps.gaps.some(gap => gap.key === 'worldPresets') && gaps.gaps.some(gap => gap.key === 'packFormat'));
  assert.throws(() => checkAgainstExtraction(validateRequest(base()), gaps), /no world presets/);
  assert.equal(checkAgainstExtraction(validateRequest(base({worldType: 'large_biomes'})), options), 'minecraft:large_biomes');
  assert.throws(() => checkAgainstExtraction(validateRequest(base({worldType: 'mystery'})), options), /no world preset named mystery/);
  assert.throws(() => checkAgainstExtraction(validateRequest(base({tweaks: {singleBiome: 'minecraft:nowhere'}})), options), /no biome named/);
});

test('the ZIP writer round-trips files, refuses to overwrite and leaves no part file on failure', async () => {
  const source = await temp();
  await fs.mkdir(path.join(source, 'world', 'region'), {recursive: true});
  const payloads = {'world/level.dat': Buffer.from('level'), 'world/region/r.0.0.mca': Buffer.alloc(200000, 7), 'world/empty.txt': Buffer.alloc(0)};
  for (const [name, bytes] of Object.entries(payloads)) await fs.writeFile(path.join(source, ...name.split('/')), bytes);
  const entries = await listTree(path.join(source, 'world'), 'world');
  assert.deepEqual(entries.map(entry => entry.name).sort(), Object.keys(payloads).sort());
  const target = path.join(await temp(), 'world.zip');
  await writeZip(target, entries);
  const directory = await readZipDirectory(target);
  assert.equal(directory.length, 3);
  for (const item of directory) { assert.equal(item.size, payloads[item.name].length); assert.equal(item.crc, zlib.crc32(payloads[item.name]) >>> 0); }
  await assert.rejects(() => writeZip(target, entries), /already exists/);
  await assert.rejects(async () => writeZip(path.join(await temp(), 'bad.zip'), [{name: '../escape', file: entries[0].file}]), /unsafe/);
  await assert.rejects(async () => writeZip(path.join(await temp(), 'gone.zip'), [{name: 'x', file: path.join(source, 'missing')}]));
  const leftovers = (await fs.readdir(path.dirname(target))).filter(name => name.endsWith('.part'));
  assert.deepEqual(leftovers, []);
  if (process.platform === 'win32') {
    const extracted = await temp();
    const result = spawnSync('tar', ['-xf', target, '-C', extracted], {encoding: 'utf8'});
    if (result.status === 0) {
      assert.deepEqual(await fs.readFile(path.join(extracted, 'world', 'region', 'r.0.0.mca')), payloads['world/region/r.0.0.mca'], 'an independent ZIP reader extracts the same bytes');
      assert.equal((await fs.readFile(path.join(extracted, 'world', 'level.dat'))).toString(), 'level');
    }
  }
});

test('the server download is accepted only when size and SHA-1 match, and a mismatch leaves nothing behind', async () => {
  const bytes = Buffer.from('official server bytes');
  const sha1 = createHash('sha1').update(bytes).digest('hex');
  const make = body => async () => new Response(body, {status: 200, headers: {'content-length': String(body.length)}});
  const directory = await temp();
  const good = path.join(directory, 'server.jar');
  await downloadVerified({url: 'https://piston-data.mojang.com/x', sha1, size: bytes.length, destination: good, fetchImpl: make(bytes)});
  assert.deepEqual(await fs.readFile(good), bytes);
  const bad = path.join(directory, 'bad.jar');
  await assert.rejects(() => downloadVerified({url: 'https://piston-data.mojang.com/x', sha1: '0'.repeat(40), size: bytes.length, destination: bad, fetchImpl: make(bytes)}), /official SHA-1/);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['server.jar']);
  await assert.rejects(() => downloadVerified({url: 'https://piston-data.mojang.com/x', sha1, size: bytes.length + 1, destination: bad, fetchImpl: make(bytes)}), /size differs/);
});

/** A scripted fake Java process: prints a Done line, answers console commands and writes the level.dat when saving. */
function fakeServer({workingDirectory, levelName, delay = 0}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.exitCode = null;
  child.kill = () => { child.exitCode = 1; child.emit('exit', 1); };
  const commands = [];
  let buffer = '';
  child.stdin.on('data', chunk => {
    buffer += String(chunk);
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const command = buffer.slice(0, index); buffer = buffer.slice(index + 1); commands.push(command);
      if (command.startsWith('forceload add')) setTimeout(() => child.stdout.write('[Server thread/INFO]: Marked chunks to be force loaded\n'), delay);
      else if (command === 'save-all flush') { fs.mkdir(path.join(workingDirectory, levelName, 'region'), {recursive: true}).then(() => Promise.all([fs.writeFile(path.join(workingDirectory, levelName, 'level.dat'), 'dat'), fs.writeFile(path.join(workingDirectory, levelName, 'region', 'r.0.0.mca'), Buffer.alloc(5000, 3))])).then(() => child.stdout.write('[Server thread/INFO]: Saved the game\n'), error => child.stdout.write('FAKEERR ' + error.message + '\n')); }
      else if (command === 'stop') setImmediate(() => { child.exitCode = 0; child.emit('exit', 0); });
    }
  });
  setImmediate(() => child.stdout.write('[Server thread/INFO]: Done (1.2s)! For help, type "help"\n'));
  child.commands = commands;
  return child;
}

async function generatorHarness({license = true, worldgen = true, delay = 0} = {}) {
  const data = await temp();
  const outputRoot = await temp();
  const spawned = [];
  const jar = Buffer.from('jar');
  const row = {id: '1.21.4', metadataUrl: 'https://piston-meta.mojang.com/v1/x.json', metadataSha1: '0'.repeat(40)};
  const sha1 = createHash('sha1').update(jar).digest('hex');
  const metadata = JSON.stringify({id: '1.21.4', downloads: {server: {url: 'https://piston-data.mojang.com/v1/objects/server.jar', sha1, size: jar.length}}, javaVersion: {component: 'java-runtime-delta', majorVersion: 21}});
  const metaSha = createHash('sha1').update(metadata).digest('hex');
  row.metadataSha1 = metaSha;
  const requested = [];
  const fetchImpl = async url => { requested.push(String(url)); return String(url).includes('objects') ? new Response(jar, {headers: {'content-length': String(jar.length)}}) : new Response(metadata, {headers: {'content-length': String(metadata.length)}}); };
  const events = [];
  let licenseAsked = 0;
  const deps = {
    execFile: async (file, args, options) => {
      if (args[0] === '-version') return {stdout: '', stderr: 'openjdk version "21.0.4" 2024-07-16'};
      const output = args[args.indexOf('--output') + 1];
      await fakeGeneratorOutput(output, {withWorldgen: worldgen});
      await fs.writeFile(path.join(output, 'version.json'), JSON.stringify({id: '1.21.4', pack_version: {data: 61}}));
      return {stdout: '', stderr: ''};
    },
    spawn: (file, args, options) => { const child = fakeServer({workingDirectory: options.cwd, levelName: 'world', delay}); spawned.push({file, args, options, child}); return child; }
  };
  const generator = createWorldGenerator({dataDirectory: data, fetchImpl, deps, getRow: id => id === '1.21.4' ? row : undefined, confirmLicense: async () => { licenseAsked++; return license; }, pickDestination: async kind => kind === 'zip' ? path.join(outputRoot, 'world.zip') : outputRoot, emit: event => events.push(event), forceloadTimeoutMs: 5000, startTimeoutMs: 5000});
  return {generator, data, outputRoot, spawned, events, requested, licenseAsked: () => licenseAsked};
}

async function finish(generator) {
  for (let index = 0; index < 400; index++) { const status = await generator.dispatch('worldGenerationStatus', {}); if (status && status.status !== 'running') return status; await new Promise(resolve => setTimeout(resolve, 25)); }
  throw new Error('generation did not finish');
}

test('a full generation downloads, extracts, runs the server over every batch and delivers a verified folder', async () => {
  const {generator, outputRoot, spawned, requested, licenseAsked} = await generatorHarness();
  const options = await generator.dispatch('worldOptions', {versionId: '1.21.4'});
  assert.deepEqual(options.worldPresets, ['minecraft:flat', 'minecraft:large_biomes', 'minecraft:normal']);
  assert.ok(requested.every(url => /^https:\/\/piston-(meta|data)\.mojang\.com\//.test(url)), 'only official hosts are contacted');
  const destination = await generator.dispatch('pickWorldDestination', {kind: 'folder'});
  const started = await generator.dispatch('startWorldGeneration', {versionId: '1.21.4', seed: 'abc', widthChunks: 20, depthChunks: 20, eulaAccepted: true, gamerules: {doDaylightCycle: false}, borderFollowsArea: true, output: {kind: 'folder', destinationId: destination.destinationId}});
  assert.equal(started.status, 'running');
  const status = await finish(generator);
  assert.equal(status.status, 'done', JSON.stringify(status));
  assert.equal(status.progress.done, 4, '20 by 20 chunks is four 256-chunk rectangles');
  assert.equal(licenseAsked(), 1);
  const {child, options: spawnOptions} = spawned[0];
  const commands = child.commands;
  assert.equal(commands.filter(command => command.startsWith('forceload add')).length, 4);
  assert.ok(commands.includes('gamerule doDaylightCycle false') && commands.includes('worldborder set 320') && commands.at(-1) === 'stop');
  assert.ok(commands.every(command => !command.startsWith('forceload add') || Math.abs(command.split(' ')[4] - command.split(' ')[2] + 1) * Math.abs(command.split(' ')[5] - command.split(' ')[3] + 1) <= 256 * 256));
  assert.equal(status.result.kind, 'folder');
  assert.deepEqual(await fs.readdir(status.result.path).then(names => names.sort()), ['level.dat', 'region']);
  assert.equal((await fs.readFile(path.join(spawnOptions.cwd, '..', 'eula.txt')).catch(() => null)), null, 'the staging server is removed afterwards');
  const again = await generator.dispatch('pickWorldDestination', {kind: 'folder'});
  await generator.dispatch('startWorldGeneration', {versionId: '1.21.4', widthChunks: 1, depthChunks: 1, eulaAccepted: true, output: {kind: 'folder', destinationId: again.destinationId}});
  const second = await finish(generator);
  assert.equal(second.status, 'done');
  assert.notEqual(second.result.path, status.result.path, 'folder output never overwrites an earlier world');
  assert.match(path.basename(second.result.path), /world \(1\)/);
  void outputRoot;
});

test('ZIP output is verified against the generated world', async () => {
  const {generator} = await generatorHarness();
  await generator.dispatch('worldOptions', {versionId: '1.21.4'});
  const destination = await generator.dispatch('pickWorldDestination', {kind: 'zip'});
  await generator.dispatch('startWorldGeneration', {versionId: '1.21.4', widthChunks: 2, depthChunks: 2, eulaAccepted: true, output: {kind: 'zip', destinationId: destination.destinationId}});
  const status = await finish(generator);
  assert.equal(status.status, 'done', JSON.stringify(status));
  const entries = await readZipDirectory(status.result.path);
  assert.deepEqual(entries.map(entry => entry.name).sort(), ['world/level.dat', 'world/region/r.0.0.mca']);
});

test('without license acceptance no server is started and nothing is delivered', async () => {
  const unaccepted = await generatorHarness({license: false});
  await unaccepted.generator.dispatch('worldOptions', {versionId: '1.21.4'});
  const destination = await unaccepted.generator.dispatch('pickWorldDestination', {kind: 'folder'});
  await unaccepted.generator.dispatch('startWorldGeneration', {versionId: '1.21.4', widthChunks: 1, depthChunks: 1, eulaAccepted: true, output: {kind: 'folder', destinationId: destination.destinationId}});
  const refused = await finish(unaccepted.generator);
  assert.equal(refused.status, 'failed');
  assert.match(refused.reason, /license was not accepted/);
  assert.equal(unaccepted.spawned.length, 0);
  const unchecked = await generatorHarness();
  await unchecked.generator.dispatch('worldOptions', {versionId: '1.21.4'});
  await unchecked.generator.dispatch('startWorldGeneration', {versionId: '1.21.4', widthChunks: 1, depthChunks: 1, output: {kind: 'folder', destinationId: ID}});
  assert.equal((await finish(unchecked.generator)).status, 'failed');
  assert.equal(unchecked.licenseAsked(), 0, 'the host dialog is not even shown unless the person ticked the box');
  assert.equal(unchecked.spawned.length, 0);
});

test('a version without extracted presets fails with the gap instead of a built-in list', async () => {
  const {generator} = await generatorHarness({worldgen: false});
  const options = await generator.dispatch('worldOptions', {versionId: '1.21.4'});
  assert.deepEqual(options.worldPresets, []);
  assert.ok(options.gaps.length > 0);
});

test('canceling stops the server, delivers nothing and clears the staging folder', async () => {
  const {generator, data, outputRoot} = await generatorHarness({delay: 40});
  await generator.dispatch('worldOptions', {versionId: '1.21.4'});
  const destination = await generator.dispatch('pickWorldDestination', {kind: 'folder'});
  await generator.dispatch('startWorldGeneration', {versionId: '1.21.4', widthChunks: 100, depthChunks: 100, eulaAccepted: true, output: {kind: 'folder', destinationId: destination.destinationId}});
  await new Promise(resolve => setTimeout(resolve, 60));
  assert.deepEqual(await generator.dispatch('abortWorldGeneration', {}), {requested: true});
  const status = await finish(generator);
  assert.equal(status.status, 'canceled');
  assert.deepEqual(await fs.readdir(outputRoot), []);
  assert.deepEqual(await fs.readdir(path.join(data, 'world-generator', 'jobs')), []);
  assert.deepEqual(await generator.dispatch('abortWorldGeneration', {}), {requested: false});
});

test('only one generation runs at a time and unknown actions are refused', async () => {
  const {generator} = await generatorHarness({delay: 40});
  await generator.dispatch('worldOptions', {versionId: '1.21.4'});
  const destination = await generator.dispatch('pickWorldDestination', {kind: 'folder'});
  const request = {versionId: '1.21.4', widthChunks: 50, depthChunks: 50, eulaAccepted: true, output: {kind: 'folder', destinationId: destination.destinationId}};
  await generator.dispatch('startWorldGeneration', request);
  await assert.rejects(() => generator.dispatch('startWorldGeneration', request), /already being generated/);
  await generator.dispatch('abortWorldGeneration', {});
  await finish(generator);
  await assert.rejects(() => generator.dispatch('wipe', {}), /Unsupported world generator action/);
  await assert.rejects(() => generator.dispatch('pickWorldDestination', {kind: 'tar'}), /folder or ZIP/);
  await assert.rejects(() => generator.dispatch('worldOptions', {versionId: 'x', extra: 1}), /Unsupported world generator request/);
});

test('the request validator admits exactly the world generator actions', () => {
  assert.deepEqual([...WORLD_ACTIONS].sort(), ['abortWorldGeneration', 'pickWorldDestination', 'startWorldGeneration', 'worldGenerationStatus', 'worldOptions']);
  const samples = {worldOptions: {versionId: '1.21.4'}, pickWorldDestination: {kind: 'zip'}, startWorldGeneration: {versionId: '1.21.4', output: {kind: 'folder', destinationId: ID}}, worldGenerationStatus: {}, abortWorldGeneration: {}};
  for (const action of WORLD_ACTIONS) validateFeatureRequest('server-manager', action, samples[action]);
  assert.throws(() => validateFeatureRequest('server-manager', 'startWorldGeneration', {versionId: '1.21.4', output: {kind: 'folder', destinationId: 'not-an-id'}}), /Unsupported server preparation payload/);
  assert.throws(() => validateFeatureRequest('server-manager', 'worldOptions', {versionId: '1.21.4', extra: 1}), /Unsupported server preparation payload/);
  assert.throws(() => validateFeatureRequest('server-manager', 'runAnything', {}), /Unsupported feature request/);
});
