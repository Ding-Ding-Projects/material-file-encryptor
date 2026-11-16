import {createKit, errorText} from '../studio-kit.js';
import {createScopedSearch} from '../../scoped-search.js';
import {parseSize, formatSize, formatForPath, COMPACT_MODES, FILE_SYSTEMS, VHDX_BLOCK_SIZES, MIN_SIZE, MIB} from '../../../features/virtual-disks/limits.js';

const MODE_HELP = {
  Full: ['Full: rewrites every block and gives back the most space. Slowest.', '完整：重寫所有區塊，可以退回最多空間，但最慢。'],
  Quick: ['Quick: reclaims unused blocks without moving data. The disk is attached read-only while it runs.', '快速：回收未用區塊但唔搬動資料。執行期間磁碟會以唯讀方式連接。'],
  Retrim: ['Retrim: sends the free space to the storage as unused. The disk is attached read-only while it runs.', '重新修剪：將可用空間標示為未用。執行期間磁碟會以唯讀方式連接。'],
  Pretrimmed: ['Pretrimmed: the disk is already trimmed, so only the end of the file is cut.', '已修剪：磁碟已經修剪過，只會裁走檔案尾部。'],
  Prezeroed: ['Prezeroed: the free space is already zeroed, so it is dropped without rewriting.', '已清零：可用空間已清零，直接捨棄而唔重寫。']
};

/** Virtual disk manager for VHD, VHDX and ISO files. Every operation runs in the main process; this surface only asks. */
export function mountVirtualDisks(root, {request, confirmDestructive, getLanguage = () => 'en', subscribeLanguage} = {}) {
  if (typeof request !== 'function') throw new Error('The virtual disk host is required.');
  const kit = createKit(root, {getLanguage, subscribeLanguage});
  const {tr, plain} = kit;
  const state = {caps: null, disks: [], listMessage: '', file: null, info: null, message: '', tone: '', busy: false, equivalent: null,
    create: {path: '', size: '10 GB', type: 'dynamic', block: 0, sector: 0, initialize: false, fileSystem: 'NTFS', label: ''},
    resize: {size: ''}, extend: true, readOnly: false, mode: 'Full', convert: {destination: '', type: 'dynamic'}};
  let alive = true, search = null;
  const section = plain('section', 'studio-suite virtual-disks');
  root.append(section);

  const say = (message, tone = '') => { state.message = message; state.tone = tone; const node = section.querySelector('[data-role="status"]'); if (node) { node.textContent = message; if (tone) node.dataset.tone = tone; else delete node.dataset.tone; } };

  async function guarded(label, work) {
    if (state.busy) { say(tr('Another virtual disk operation is running.', '另一個虛擬磁碟操作進行緊。'), 'error'); return; }
    state.busy = true; say(tr('Working: ', '處理中：') + label); render();
    try { await work(); } catch (error) { say(errorText(error), 'error'); }
    finally { state.busy = false; if (alive) render(); }
  }

  function report(outcome, successText) {
    state.equivalent = outcome.equivalent ?? null;
    if (outcome.status === 'done') say(successText + (outcome.route ? ' (' + tr('route', '途徑') + ': ' + outcome.route + ')' : ''));
    else if (outcome.status === 'incomplete') say(tr('Incomplete: ', '未完成：') + outcome.reason, 'error');
    else say(outcome.reason ?? tr('The operation failed.', '操作失敗。'), 'error');
    return outcome.status === 'done';
  }

  async function loadCapabilities() {
    try { state.caps = await request('capabilities', {}); } catch (error) { state.caps = {supported: false, reason: errorText(error)}; }
    if (state.caps.supported) await refreshList(false);
    if (alive) render();
  }

  async function refreshList(elevate) {
    try {
      const outcome = await request('list', {elevate});
      if (outcome.status === 'done') { state.disks = outcome.result?.disks ?? []; state.listMessage = ''; }
      else state.listMessage = outcome.reason ?? '';
    } catch (error) { state.listMessage = errorText(error); }
    if (alive) renderLibrary();
  }

  async function choose(kind) {
    try {
      const picked = await request('pickDisk', {kind});
      if (!picked) return;
      state.file = picked.path; state.info = null; state.equivalent = null;
      state.resize.size = ''; render();
      if (kind === 'disk') await inspect();
    } catch (error) { say(errorText(error), 'error'); }
  }

  async function inspect() {
    if (!state.file) return;
    const outcome = await request('inspect', {path: state.file});
    if (outcome.status === 'done') { state.info = outcome.result; if (!state.resize.size && outcome.result.sizeBytes) state.resize.size = formatSize(outcome.result.sizeBytes); }
    else say(outcome.reason, 'error');
    render();
  }

  const row = () => plain('div', 'studio-row');

  function renderLibrary() {
    const host = section.querySelector('[data-role="library"]');
    if (!host) return;
    host.replaceChildren();
    const refresh = kit.button('Refresh', '重新整理', () => refreshList(false));
    const elevated = kit.button('Refresh with administrator rights', '用管理員權限重新整理', () => refreshList(true), {disabled: state.caps?.elevated === true});
    const head = row(); head.append(refresh, elevated);
    host.append(head);
    if (state.listMessage) host.append(plain('p', 'studio-status', state.listMessage));
    if (!state.disks.length) { host.append(plain('p', '', tr('No virtual disks are attached right now.', '而家冇已連接嘅虛擬磁碟。'))); return; }
    const searchHost = plain('div'); host.append(searchHost);
    const table = plain('table'); host.append(table);
    const paint = rows => {
      table.replaceChildren();
      const header = plain('tr');
      for (const label of [tr('File', '檔案'), tr('Disk', '磁碟'), tr('Size', '大小'), tr('Letters', '磁碟機代號'), tr('Mode', '模式')]) header.append(plain('th', '', label));
      table.append(header);
      for (const disk of rows) {
        const tableRow = plain('tr');
        const select = kit.button(disk.path || tr('(unknown)', '（未知）'), disk.path || '', () => { state.file = disk.path; state.info = null; state.resize.size = ''; render(); void inspect(); }, {variant: 'text'});
        const cell = plain('td'); cell.append(select);
        tableRow.append(cell, plain('td', '', '#' + disk.number), plain('td', '', formatSize(disk.sizeBytes)), plain('td', '', (disk.letters ?? []).join(', ') || '-'), plain('td', '', disk.readOnly ? tr('Read-only', '唯讀') : tr('Read-write', '讀寫')));
        table.append(tableRow);
      }
    };
    search?.destroy();
    search = createScopedSearch(searchHost, value => value, async () => {
      const result = await search.filter(state.disks.map(disk => ({...disk, path: [disk.path, '#' + disk.number, (disk.letters ?? []).join(' ')].join(' ')})));
      const keep = new Set(result.map(item => item.number));
      paint(state.disks.filter(disk => keep.has(disk.number)));
    });
    search.input.language = getLanguage(); search.refresh();
    paint(state.disks);
  }

  function renderInfo(parent) {
    const info = state.info;
    if (!info) return;
    const list = plain('table');
    const lines = [[tr('Attached', '已連接'), info.attached ? tr('Yes', '是') : tr('No', '否')], [tr('Virtual size', '虛擬大小'), formatSize(info.sizeBytes)], [tr('Size on disk', '實際佔用'), formatSize(info.fileBytes)]];
    if (info.minimumBytes) lines.push([tr('Smallest safe size', '最小安全大小'), formatSize(info.minimumBytes)]);
    if (info.format) lines.push([tr('Format and type', '格式同類型'), info.format + ' · ' + info.type]);
    if (info.blockSize) lines.push([tr('Block size', '區塊大小'), formatSize(info.blockSize)]);
    if (info.logicalSectorSize) lines.push([tr('Sector sizes', '磁區大小'), info.logicalSectorSize + ' / ' + (info.physicalSectorSize ?? '?')]);
    if (info.number !== null && info.number !== undefined) lines.push([tr('Disk number', '磁碟編號'), '#' + info.number + ' · ' + info.partitionStyle + ' · ' + info.partitions + ' ' + tr('partitions', '個分割區')]);
    if (info.letters?.length) lines.push([tr('Drive letters', '磁碟機代號'), info.letters.join(', ')]);
    if (info.parentPath) lines.push([tr('Parent disk', '父磁碟'), info.parentPath]);
    if (info.fragmentation !== undefined) lines.push([tr('Fragmentation', '碎片化'), info.fragmentation + '%']);
    if (info.diskIdentifier) lines.push([tr('Disk identifier', '磁碟識別碼'), info.diskIdentifier]);
    for (const [name, value] of lines) { const tableRow = plain('tr'); tableRow.append(plain('th', '', name), plain('td', '', value)); list.append(tableRow); }
    parent.append(list);
    if (!info.format) parent.append(plain('p', 'studio-lede', tr('Detailed fields need the Hyper-V PowerShell module, which this computer does not have.', '詳細欄位需要 Hyper-V PowerShell 模組，呢部電腦冇安裝。')));
  }

  function renderFile(parent) {
    const box = plain('fieldset', 'studio-fieldset');
    box.append(plain('legend', '', tr('Selected file', '所選檔案')));
    if (!state.file) { box.append(plain('p', '', tr('Choose a .vhd, .vhdx or .iso file to work with it.', '揀一個 .vhd、.vhdx 或者 .iso 檔案來處理。'))); parent.append(box); return; }
    box.append(plain('p', '', state.file));
    const isIso = state.file.toLowerCase().endsWith('.iso');
    renderInfo(box);
    const name = state.file;
    const actions = row();
    if (isIso) {
      actions.append(kit.button('Mount the ISO', '掛載 ISO', () => guarded(tr('mounting', '掛載中'), async () => { if (report(await request('mountIso', {path: name}), tr('The ISO is mounted read-only.', 'ISO 已經以唯讀方式掛載。'))) await refreshList(false); }), {variant: 'primary', disabled: state.busy}));
      box.append(actions);
      parent.append(box);
      return;
    }
    box.append(kit.toggle('Attach read-only', '以唯讀方式連接', state.readOnly, value => { state.readOnly = value; }));
    actions.append(
      kit.button('Inspect', '檢視', () => guarded(tr('inspecting', '檢視中'), inspect), {disabled: state.busy}),
      kit.button('Attach', '連接', () => guarded(tr('attaching', '連接中'), async () => { if (report(await request('attach', {path: name, readOnly: state.readOnly}), tr('The disk is attached.', '磁碟已連接。'))) { await refreshList(false); await inspect(); } }), {variant: 'primary', disabled: state.busy}),
      kit.button('Detach', '中斷連接', () => guarded(tr('detaching', '中斷連接中'), async () => {
        const affected = tr('The disk "', '磁碟「') + name + tr('" is disconnected. Files open on it may lose unsaved changes.', '」會中斷連接。喺度開住嘅檔案可能會失去未儲存嘅更改。');
        if (typeof confirmDestructive === 'function' && await confirmDestructive('desktop.virtual-disk-detach', affected) !== true) { say(tr('Detach cancelled. Nothing changed.', '已取消中斷連接，冇任何更改。')); return; }
        if (report(await request('detach', {path: name}), tr('The disk is detached.', '磁碟已中斷連接。'))) { await refreshList(false); await inspect(); }
      }), {disabled: state.busy}));
    box.append(actions);

    const resizeRow = row();
    resizeRow.append(kit.textField('New size', '新大小', state.resize.size, value => { state.resize.size = value; }, {hint: tr('For example 60 GB', '例如 60 GB')}),
      kit.toggle('Extend the last partition into new space', '將最後一個分割區延伸到新空間', state.extend, value => { state.extend = value; }),
      kit.button('Resize', '調整大小', () => guarded(tr('resizing', '調整大小中'), async () => {
        const bytes = parseSize(state.resize.size);
        const shrinking = state.info?.sizeBytes && bytes < state.info.sizeBytes;
        if (shrinking) {
          const affected = tr('The disk "', '磁碟「') + name + tr('" shrinks to ', '」會縮小至 ') + formatSize(bytes) + tr('. Data past the new end is lost unless the partition was shrunk first.', '。如果冇先縮小分割區，新結尾之後嘅資料會遺失。');
          if (typeof confirmDestructive === 'function' && await confirmDestructive('desktop.virtual-disk-resize-shrink', affected) !== true) { say(tr('Resize cancelled. Nothing changed.', '已取消調整大小，冇任何更改。')); return; }
        }
        if (report(await request('resize', {path: name, sizeBytes: bytes, extendPartition: state.extend, confirmShrink: !!shrinking}), tr('The disk was resized.', '磁碟已調整大小。'))) await inspect();
      }), {disabled: state.busy}));
    box.append(resizeRow);

    const compactRow = row();
    compactRow.append(kit.select('Compact mode', '壓縮模式', COMPACT_MODES.map(mode => [mode, mode]), state.mode, value => { state.mode = value; render(); }),
      kit.button('Compact', '壓縮', () => guarded(tr('compacting', '壓縮中'), async () => {
        const affected = tr('The file "', '檔案「') + name + tr('" is rewritten in place using the ', '」會就地重寫，使用') + state.mode + tr(' mode.', '模式。');
        if (typeof confirmDestructive === 'function' && await confirmDestructive('desktop.virtual-disk-compact', affected) !== true) { say(tr('Compact cancelled. Nothing changed.', '已取消壓縮，冇任何更改。')); return; }
        const outcome = await request('compact', {path: name, mode: state.mode});
        if (report(outcome, tr('The disk was compacted.', '磁碟已壓縮。')) && outcome.result) say(state.message + ' ' + formatSize(outcome.result.before) + ' → ' + formatSize(outcome.result.after));
        await inspect();
      }), {disabled: state.busy}));
    box.append(compactRow, plain('p', 'studio-lede', tr(...MODE_HELP[state.mode])));

    const convertRow = row();
    convertRow.append(kit.button('Choose the converted file…', '揀轉換後嘅檔案…', async () => { const picked = await request('pickNewDisk', {}); if (picked) { state.convert.destination = picked.path; render(); } }),
      kit.select('Converted type', '轉換後類型', [['dynamic', tr('Dynamic', '動態')], ['fixed', tr('Fixed', '固定')]], state.convert.type, value => { state.convert.type = value; }),
      kit.button('Convert', '轉換', () => guarded(tr('converting', '轉換中'), async () => { report(await request('convert', {path: name, destination: state.convert.destination, type: state.convert.type}), tr('A converted copy was written. The original is untouched.', '已寫入轉換後嘅副本，原本檔案冇更改。')); }), {disabled: state.busy || !state.convert.destination}));
    box.append(convertRow);
    if (state.convert.destination) box.append(plain('p', 'studio-lede', tr('Converted copy: ', '轉換後副本：') + state.convert.destination));
    parent.append(box);
  }

  function renderCreate(parent) {
    const box = plain('fieldset', 'studio-fieldset');
    box.append(plain('legend', '', tr('Create a new virtual disk', '建立新虛擬磁碟')));
    const draft = state.create;
    box.append(plain('p', '', draft.path || tr('No file chosen yet.', '未揀檔案。')));
    const vhdx = draft.path ? formatForPath(draft.path) === 'vhdx' : true;
    box.append(kit.button('Choose where to save…', '揀儲存位置…', async () => { const picked = await request('pickNewDisk', {}); if (picked) { draft.path = picked.path; render(); } }));
    box.append(kit.textField('Size', '大小', draft.size, value => { draft.size = value; }, {hint: tr('At least 3 MB. VHD up to 2,040 GB, VHDX up to 64 TB.', '最少 3 MB。VHD 最多 2,040 GB，VHDX 最多 64 TB。')}));
    box.append(kit.select('Type', '類型', [['dynamic', tr('Dynamic (grows as needed)', '動態（按需要增長）')], ['fixed', tr('Fixed (reserves the whole size)', '固定（預留全部大小）')]], draft.type, value => { draft.type = value; }));
    if (vhdx) {
      box.append(kit.select('Block size', '區塊大小', [['0', tr('Default', '預設')], ...VHDX_BLOCK_SIZES.map(size => [String(size), formatSize(size)])], String(draft.block), value => { draft.block = Number(value); }));
      box.append(kit.select('Sector size', '磁區大小', [['0', tr('Default', '預設')], ['512', '512'], ['4096', '4096']], String(draft.sector), value => { draft.sector = Number(value); }));
    }
    box.append(kit.toggle('Initialize, partition and format', '初始化、分割同格式化', draft.initialize, value => { draft.initialize = value; render(); }));
    if (draft.initialize) {
      box.append(kit.select('File system', '檔案系統', FILE_SYSTEMS.map(item => [item, item]), draft.fileSystem, value => { draft.fileSystem = value; }));
      box.append(kit.textField('Volume label', '磁碟區標籤', draft.label, value => { draft.label = value; }));
    }
    box.append(kit.button('Create', '建立', () => guarded(tr('creating', '建立中'), async () => {
      const payload = {path: draft.path, sizeBytes: parseSize(draft.size), type: draft.type};
      if (payload.sizeBytes < MIN_SIZE) throw new Error(tr('A virtual disk must be at least 3 MB.', '虛擬磁碟最少要 3 MB。'));
      if (payload.sizeBytes % MIB) throw new Error(tr('Use a whole number of megabytes.', '請用成數兆位元組。'));
      if (vhdx && draft.block) payload.blockSizeBytes = draft.block;
      if (vhdx && draft.sector) payload.logicalSectorSize = draft.sector;
      if (draft.initialize) payload.initialize = {partitionStyle: 'GPT', fileSystem: draft.fileSystem, label: draft.label};
      if (report(await request('create', payload), tr('The disk was created. It never replaces an existing file.', '磁碟已建立，亦唔會取代現有檔案。'))) { state.file = draft.path; state.info = null; await inspect(); await refreshList(false); }
    }), {variant: 'primary', disabled: state.busy || !draft.path}));
    parent.append(box);
  }

  function render() {
    if (!alive) return;
    search?.destroy(); search = null;
    section.replaceChildren();
    section.setAttribute('aria-label', tr('Virtual disks', '虛擬磁碟'));
    section.append(plain('h2', '', tr('Virtual disks', '虛擬磁碟')), plain('p', 'studio-lede', tr('Create, attach, resize, compact and convert VHD and VHDX files, and mount ISO images. Steps that need administrator rights ask once through the Windows prompt, and a declined prompt changes nothing.', '建立、連接、調整大小、壓縮同轉換 VHD 同 VHDX 檔案，亦可以掛載 ISO。需要管理員權限嘅步驟會透過 Windows 提示詢問一次，拒絕就唔會更改任何嘢。')));
    if (!state.caps) { section.append(plain('p', '', tr('Checking this computer…', '檢查緊呢部電腦…'))); return; }
    if (!state.caps.supported) { section.append(plain('p', 'studio-status', state.caps.reason)); return; }
    const caps = state.caps;
    section.append(plain('p', 'studio-lede', tr('Routes on this computer: ', '呢部電腦可用途徑：') + [caps.storage && 'Storage', caps.hyperv && 'Hyper-V', caps.diskpart && 'DiskPart'].filter(Boolean).join(', ') + (caps.hyperv ? '' : ' · ' + tr('Without the Hyper-V module, converting and the quick compact modes are unavailable.', '冇 Hyper-V 模組嘅話，無法轉換同使用快速壓縮模式。'))));
    const grid = plain('div', 'studio-grid');
    const left = plain('div', 'studio-col'), right = plain('div', 'studio-col');
    grid.append(left, right); section.append(grid);
    const open = row();
    open.append(kit.button('Choose a disk file…', '揀磁碟檔案…', () => choose('disk'), {variant: 'primary'}), kit.button('Choose an ISO…', '揀 ISO…', () => choose('iso')));
    left.append(open);
    const library = plain('div'); library.dataset.role = 'library'; left.append(plain('h3', '', tr('Attached disks', '已連接磁碟')), library);
    renderFile(left);
    renderCreate(right);
    const status = kit.status(); status.dataset.role = 'status'; status.textContent = state.message; if (state.tone) status.dataset.tone = state.tone;
    section.append(status);
    if (state.equivalent && (state.equivalent.powershell || state.equivalent.diskpart)) {
      const pre = plain('pre', '', [state.equivalent.powershell, state.equivalent.diskpart && '# DiskPart\n' + state.equivalent.diskpart].filter(Boolean).join('\n'));
      const head = row(); head.append(plain('h3', '', tr('Equivalent script', '等效指令碼')), kit.button('Copy', '複製', () => navigator.clipboard?.writeText(pre.textContent)));
      section.append(head, pre);
    }
    renderLibrary();
  }

  kit.onLanguage(() => render());
  render();
  void loadCapabilities();
  return {refresh: () => refreshList(false), setLanguage: render, destroy() { alive = false; search?.destroy(); kit.destroy(); section.remove(); }};
}
