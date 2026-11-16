import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {parseSize, formatSize, validateCreate, validateResize, validateConvert, validateWindowsPath, formatForPath, GIB, MIB, TIB} from '../src/features/virtual-disks/limits.js';
import {scriptFor, encodeCommand, equivalentScript, OPERATIONS} from '../src/features/virtual-disks/scripts.js';
import {createVirtualDiskService, createPowerShellRunner, chooseRoute, ElevationCancelled} from '../src/features/virtual-disks/service.js';
import {validateFeatureRequest} from '../src/main/validation.js';

const decode = encoded => Buffer.from(encoded, 'base64').toString('utf16le');
const params64 = encoded => /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(decode(encoded))[1];

test('sizes parse with units and format limits are enforced before anything is written', () => {
  assert.equal(parseSize('40 GB'), 40 * GIB);
  assert.equal(parseSize('512mb'), 512 * MIB);
  assert.equal(parseSize('1.5 TB'), 1.5 * TIB);
  assert.throws(() => parseSize('lots'), /size/);
  assert.throws(() => parseSize('5 parsecs'), /unit/);
  assert.equal(formatSize(3 * MIB), '3 MB');
  const base = {path: 'C:\\disks\\a.vhdx', type: 'dynamic', sizeBytes: 10 * GIB};
  assert.equal(validateCreate(base).format, 'vhdx');
  assert.throws(() => validateCreate({...base, sizeBytes: 2 * MIB}), /at least 3 MB/);
  assert.throws(() => validateCreate({...base, path: 'C:\\disks\\a.vhd', sizeBytes: 2041 * GIB}), /2,040 GB/);
  assert.throws(() => validateCreate({...base, sizeBytes: 65 * TIB}), /64 TB/);
  assert.equal(validateCreate({...base, sizeBytes: 64 * TIB}).sizeBytes, 64 * TIB);
  assert.throws(() => validateCreate({...base, sizeBytes: 10 * GIB + 1}), /whole number of megabytes/);
  assert.throws(() => validateCreate({...base, blockSizeBytes: 3 * MIB}), /power of two/);
  assert.throws(() => validateCreate({...base, path: 'C:\\disks\\a.vhd', blockSizeBytes: 2 * MIB}), /VHDX only/);
  assert.throws(() => validateCreate({...base, logicalSectorSize: 1024}), /512 or 4096/);
  assert.equal(validateCreate({...base, blockSizeBytes: 32 * MIB, logicalSectorSize: 4096}).blockSizeBytes, 32 * MIB);
  assert.throws(() => validateCreate({...base, type: 'sparse'}), /fixed or dynamic/);
  assert.throws(() => validateCreate({...base, format: 'vhd'}), /extension must match/);
});

test('paths must be local, absolute and of the right kind', () => {
  assert.throws(() => validateWindowsPath('\\\\server\\share\\a.vhdx'), /network or device/);
  assert.throws(() => validateWindowsPath('relative\\a.vhdx'), /absolute/);
  assert.throws(() => validateWindowsPath('C:\\a\\..\\b.vhdx'), /dot segments/);
  assert.throws(() => validateWindowsPath('C:\\a"b.vhdx'), /characters/);
  assert.throws(() => validateWindowsPath('C:\\a\\b.txt'), /\.vhd/);
  assert.throws(() => validateWindowsPath('C:\\a\\b.vhdx', {purpose: 'iso'}), /\.iso/);
  assert.equal(validateWindowsPath('D:\\images\\x.ISO', {purpose: 'iso'}), 'D:\\images\\x.ISO');
  assert.equal(formatForPath('C:\\a.avhd'), 'vhd');
});

test('resize and convert reject what the target cannot hold', () => {
  const path = 'C:\\d\\a.vhdx';
  assert.deepEqual(validateResize({path, sizeBytes: 20 * GIB, currentBytes: 10 * GIB}), {path, sizeBytes: 20 * GIB, shrinking: false});
  assert.throws(() => validateResize({path, sizeBytes: 10 * GIB, currentBytes: 10 * GIB}), /already has that size/);
  assert.throws(() => validateResize({path, sizeBytes: 5 * GIB, currentBytes: 10 * GIB}), /smallest safe size is unknown/);
  assert.throws(() => validateResize({path, sizeBytes: 5 * GIB, currentBytes: 10 * GIB, minimumBytes: 8 * GIB}), /cannot shrink below 8 GB/);
  assert.equal(validateResize({path, sizeBytes: 9 * GIB, currentBytes: 10 * GIB, minimumBytes: 8 * GIB}).shrinking, true);
  assert.throws(() => validateResize({path: 'C:\\d\\a.vhd', sizeBytes: 1 * GIB, currentBytes: 2 * GIB, minimumBytes: 1}), /Only a VHDX can shrink/);
  assert.throws(() => validateConvert({path, destination: 'C:\\d\\a.vhd', sizeBytes: 3000 * GIB}), /cannot hold/);
  assert.throws(() => validateConvert({path, destination: path}), /different destination/);
  assert.equal(validateConvert({path, destination: 'C:\\d\\b.vhd', sizeBytes: GIB}).format, 'vhd');
});

test('scripts never splice caller values and carry them as one base64 parameter block', () => {
  const hostile = {path: "C:\\x'; Remove-Item C:\\ -Recurse #.vhdx", label: '$(calc)'};
  for (const name of OPERATIONS) {
    const text = scriptFor(name);
    assert.ok(text.includes('{{PARAMS}}'), name);
    assert.ok(!text.includes('Remove-Item C:'), name);
  }
  const encoded = encodeCommand('attach', hostile);
  const script = decode(encoded);
  assert.ok(!script.includes('Remove-Item C:'));
  assert.ok(!script.includes('$(calc)'));
  assert.deepEqual(JSON.parse(Buffer.from(params64(encoded), 'base64').toString('utf8')), hostile);
  assert.throws(() => scriptFor('nope'), /Unknown/);
  assert.throws(() => scriptFor([]), /Unknown/);
  const combined = decode(encodeCommand(['create_hyperv', 'initialize'], {}));
  assert.ok(combined.includes('New-VHD') && combined.includes('Initialize-Disk') && combined.includes('$s1'));
});

test('every script parses as PowerShell on a host that has it', {skip: process.platform !== 'win32'}, () => {
  const names = [...OPERATIONS];
  const script = "$ErrorActionPreference='Stop';$bad=0;foreach($e in $input){$t=$null;$err=$null;[void][System.Management.Automation.Language.Parser]::ParseInput($e,[ref]$t,[ref]$err);if($err.Count){$bad++;Write-Output ('PARSE '+$err[0].Message)}};Write-Output ('bad='+$bad+' count='+@($input).Count)";
  const texts = names.map(name => scriptFor(name).replace('{{PARAMS}}', 'e30=').replace(/\r?\n/g, ' '));
  const input = texts.join('\n');
  const probe = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$all=[Console]::In.ReadToEnd() -split \"`n\";" + script.replace('$input', '$all')], {input, encoding: 'utf8', timeout: 60000});
  if (probe.error) return;
  assert.match(probe.stdout, new RegExp('bad=0 count=' + names.length), probe.stdout);
});

test('equivalent scripts quote every value and cover each route', () => {
  const path = "C:\\it's\\a.vhdx";
  assert.equal(equivalentScript('create', {path, sizeBytes: 10 * MIB, type: 'dynamic'}).powershell, "New-VHD -Path 'C:\\it''s\\a.vhdx' -SizeBytes 10485760 -Dynamic");
  assert.match(equivalentScript('create', {path, sizeBytes: 10 * MIB, type: 'fixed'}, 'diskpart').diskpart, /create vdisk file=.*maximum=10 type=fixed/);
  assert.match(equivalentScript('compact', {path, mode: 'Quick'}).powershell, /Optimize-VHD .* -Mode Quick/);
  assert.match(equivalentScript('attach', {path, readOnly: true}).diskpart, /attach vdisk readonly/);
  assert.throws(() => equivalentScript('explode', {}), /Unknown/);
});

function harness({platform = 'win32', caps = {elevated: false, storage: true, hyperv: true, optimize: true, diskpart: true}, existing = new Set(), respond} = {}) {
  const calls = [];
  const runner = {async run(encoded, options) {
    const script = decode(encoded);
    calls.push({script, ...options});
    if (script.includes('IsInRole')) return JSON.stringify({ok: true, result: caps});
    if (respond) return respond(script, options);
    if (script.includes('Describe $p.path')) return JSON.stringify({ok: true, result: {sizeBytes: 10 * GIB, minimumBytes: 4 * GIB, path: 'x'}});
    return JSON.stringify({ok: true, result: {done: true}});
  }};
  const service = createVirtualDiskService({platform, runner, resultDirectory: 'C:\\tmp', exists: async file => existing.has(file), pick: {open: async () => 'C:\\d\\a.vhdx', save: async () => 'C:\\d\\new.vhdx'}});
  return {service, calls};
}

test('a path the person never chose is refused', async () => {
  const {service} = harness();
  await assert.rejects(() => service.dispatch('attach', {path: 'C:\\d\\a.vhdx'}), /Choose the file again/);
  await service.dispatch('pickDisk', {});
  const outcome = await service.dispatch('attach', {path: 'C:\\d\\a.vhdx', readOnly: true});
  assert.equal(outcome.status, 'done');
  assert.equal(outcome.route, 'storage');
  assert.match(outcome.equivalent.powershell, /ReadOnly/);
});

test('create refuses an existing file, picks the route from the host and runs one script for create plus format', async () => {
  const {service, calls} = harness({existing: new Set(['C:\\d\\taken.vhdx'])});
  const target = (await service.dispatch('pickNewDisk', {})).path;
  const outcome = await service.dispatch('create', {path: target, sizeBytes: 10 * GIB, type: 'dynamic', initialize: {fileSystem: 'NTFS', label: 'Data'}});
  assert.equal(outcome.status, 'done');
  assert.equal(outcome.route, 'hyperv');
  const last = calls.at(-1);
  assert.equal(last.elevated, true, 'creation asks for administrator approval once');
  assert.ok(last.script.includes('New-VHD') && last.script.includes('Format-Volume'));
  assert.equal(calls.filter(call => call.elevated).length, 1);
  const {service: second} = harness({existing: new Set(['C:\\d\\new.vhdx'])});
  await second.dispatch('pickNewDisk', {});
  await assert.rejects(() => second.dispatch('create', {path: 'C:\\d\\new.vhdx', sizeBytes: 10 * GIB}), /never replaces a file/);
});

test('create falls back to DiskPart without Hyper-V and says so', async () => {
  const {service} = harness({caps: {elevated: true, storage: true, hyperv: false, optimize: false, diskpart: true}});
  const target = (await service.dispatch('pickNewDisk', {})).path;
  const outcome = await service.dispatch('create', {path: target, sizeBytes: 10 * GIB});
  assert.equal(outcome.route, 'diskpart');
  assert.match(outcome.equivalent.diskpart, /create vdisk/);
});

test('a cancelled administrator prompt is reported incomplete and nothing else runs', async () => {
  const {service, calls} = harness({respond: () => { throw new ElevationCancelled(); }});
  const target = (await service.dispatch('pickNewDisk', {})).path;
  const outcome = await service.dispatch('create', {path: target, sizeBytes: 10 * GIB});
  assert.equal(outcome.status, 'incomplete');
  assert.equal(outcome.cancelled, true);
  assert.equal(calls.filter(call => call.elevated).length, 1);
  assert.equal(service.busy, false, 'the manager accepts the next operation');
});

test('shrinking needs confirmation and the disk minimum, and growing without Hyper-V uses DiskPart', async () => {
  const {service} = harness();
  await service.dispatch('pickDisk', {});
  await assert.rejects(() => service.dispatch('resize', {path: 'C:\\d\\a.vhdx', sizeBytes: 6 * GIB}), /explicit confirmation/);
  await assert.rejects(() => service.dispatch('resize', {path: 'C:\\d\\a.vhdx', sizeBytes: 3 * GIB, confirmShrink: true}), /cannot shrink below 4 GB/);
  const shrunk = await service.dispatch('resize', {path: 'C:\\d\\a.vhdx', sizeBytes: 6 * GIB, confirmShrink: true});
  assert.equal(shrunk.shrank, true);
  const {service: bare} = harness({caps: {elevated: true, storage: true, hyperv: false, optimize: false, diskpart: true}});
  await bare.dispatch('pickDisk', {});
  await assert.rejects(() => bare.dispatch('resize', {path: 'C:\\d\\a.vhdx', sizeBytes: 6 * GIB, confirmShrink: true}), /Hyper-V/);
  const grown = await bare.dispatch('resize', {path: 'C:\\d\\a.vhdx', sizeBytes: 20 * GIB});
  assert.equal(grown.route, 'diskpart');
});

test('convert and non-Full compact explain the missing route instead of failing silently', async () => {
  const {service} = harness({caps: {elevated: true, storage: true, hyperv: false, optimize: false, diskpart: true}});
  await service.dispatch('pickDisk', {});
  await assert.rejects(() => service.dispatch('convert', {path: 'C:\\d\\a.vhdx', destination: 'C:\\d\\b.vhd'}), /Hyper-V PowerShell module/);
  await assert.rejects(() => service.dispatch('compact', {path: 'C:\\d\\a.vhdx', mode: 'Quick'}), /Only the Full mode/);
  assert.equal((await service.dispatch('compact', {path: 'C:\\d\\a.vhdx'})).route, 'diskpart');
  assert.throws(() => chooseRoute('attach', {storage: false}), /Storage PowerShell module/);
});

test('only one mutating operation runs at a time', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const {service} = harness({respond: async () => { await gate; return JSON.stringify({ok: true, result: {}}); }});
  await service.dispatch('pickDisk', {});
  const first = service.dispatch('detach', {path: 'C:\\d\\a.vhdx'});
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(() => service.dispatch('detach', {path: 'C:\\d\\a.vhdx'}), /Another virtual disk operation/);
  release();
  assert.equal((await first).status, 'done');
});

test('other platforms and malformed requests are refused clearly', async () => {
  const {service} = harness({platform: 'linux'});
  assert.deepEqual(await service.dispatch('capabilities', {}), {supported: false, reason: 'The virtual disk manager needs Windows.'});
  await assert.rejects(() => service.dispatch('list', {}), /needs Windows/);
  const {service: win} = harness();
  await assert.rejects(() => win.dispatch('inspect', {path: 'C:\\a.vhdx', extra: 1}), /Unsupported virtual disk request/);
  await assert.rejects(() => win.dispatch('format', {}), /Unsupported virtual disk action/);
  await assert.rejects(() => win.dispatch('mountIso', {path: 'C:\\a.vhdx'}), /\.iso/);
});

test('listed attached disks become usable paths without a picker', async () => {
  const {service} = harness({respond: script => script.includes('Get-Disk') && script.includes('File Backed') ? JSON.stringify({ok: true, result: {disks: [{number: 3, path: 'E:\\vm\\x.vhdx'}]}}) : JSON.stringify({ok: true, result: {}})});
  await service.dispatch('list', {});
  assert.equal((await service.dispatch('detach', {path: 'E:\\vm\\x.vhdx'})).status, 'done');
});

test('the PowerShell runner rejects unsafe encoded text and maps a declined prompt', async () => {
  const runner = createPowerShellRunner({execFileImpl: (file, args, options, callback) => callback(Object.assign(new Error('x'), {stderr: 'The operation was canceled by the user.'}), '', 'canceled by the user'), resultDirectory: 'C:\\tmp'});
  await assert.rejects(() => runner.run('a b', {}), /invalid/);
  await assert.rejects(() => runner.run('QUJD', {elevated: true, resultFile: 'C:\\tmp\\r.json'}), ElevationCancelled);
  const failing = createPowerShellRunner({execFileImpl: (f, a, o, callback) => callback(Object.assign(new Error('boom'), {stderr: 'boom'}), '', 'boom'), resultDirectory: 'C:\\tmp'});
  await assert.rejects(() => failing.run('QUJD', {elevated: true, resultFile: 'C:\\tmp\\r.json'}), /boom/);
});

test('the request validator admits exactly the manager actions', () => {
  for (const action of ['capabilities', 'list', 'create', 'attach', 'detach', 'mountIso', 'resize', 'compact', 'convert', 'script', 'pickDisk', 'pickNewDisk', 'inspect']) validateFeatureRequest('virtual-disks', action, {});
  assert.throws(() => validateFeatureRequest('virtual-disks', 'wipe', {}), /Unsupported feature request/);
});
