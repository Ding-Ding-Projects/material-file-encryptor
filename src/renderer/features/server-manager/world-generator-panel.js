import {createKit, errorText} from '../studio-kit.js';
import {createArea, toCanvas, hitTest, moveBy, resizeBy, pixelsToChunks, blocks, keyboard, areaBounds} from './world-area-model.js';

const DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'];
const GAME_MODES = ['survival', 'creative', 'adventure', 'spectator'];
const STAGE_LABELS = {
  download: ['Downloading the official server', '下載緊官方伺服器'], extract: ['Reading this version\'s options', '讀取緊呢個版本嘅選項'], prepare: ['Preparing the staging server', '準備緊暫存伺服器'],
  start: ['Starting the server', '啟動緊伺服器'], generate: ['Generating chunks', '產生緊區塊'], save: ['Saving the world', '儲存緊世界'], copy: ['Copying the world out', '複製緊世界出去'], verify: ['Verifying the copy', '驗證緊副本'], done: ['Done', '完成']
};

const validJob = job => !!job && typeof job === 'object' && !!job.progress && Array.isArray(job.log) && typeof job.status === 'string';

/** World generator panel. Everything runs in the host: this panel only collects typed choices and shows real progress. */
export function mountWorldGenerator(host, {request, getLanguage = () => 'en'} = {}) {
  if (typeof request !== 'function') throw new Error('The world generator host is required.');
  const kit = createKit(host, {getLanguage});
  const {tr, plain} = kit;
  const state = {versions: null, versionId: '', options: null, area: createArea(), seed: '', levelName: 'world', worldType: 'minecraft:normal', difficulty: 'normal', gamemode: 'survival', hardcore: false, structures: true, borderFollows: false,
    flat: {enabled: false, biome: 'minecraft:plains', features: false, lakes: false, layers: [{block: 'minecraft:bedrock', height: 1}, {block: 'minecraft:dirt', height: 2}, {block: 'minecraft:grass_block', height: 1}]},
    singleBiome: '', noise: {seaLevel: '', oreVeins: true, aquifers: true, mobGeneration: true}, gamerules: {}, ruleFilter: '', outputKind: 'folder', destination: null, eula: false, job: null, message: '', tone: ''};
  let alive = true, canvas = null;
  const section = plain('section', 'studio-suite world-generator');
  host.append(section);
  const say = (message, tone = '') => { state.message = message; state.tone = tone; const node = section.querySelector('[data-role="status"]'); if (node) { node.textContent = message; if (tone) node.dataset.tone = tone; else delete node.dataset.tone; } };

  async function loadVersions() {
    try {
      const snapshot = await request('refreshCatalogue');
      const id = snapshot.catalogue.sourceSha256;
      const versions = [];
      let cursor = '0';
      for (let page = 0; page < 60 && cursor !== null && cursor !== undefined; page++) {
        const result = await request('versions', {catalogueId: id, cursor});
        versions.push(...result.versions);
        cursor = result.next ?? null;
      }
      state.versions = versions.filter(row => row.channel === 'release');
      if (!state.versionId && state.versions.length) state.versionId = state.versions[0].id;
      say(tr('Loaded ', '已載入 ') + state.versions.length + tr(' official releases.', ' 個官方版本。'));
    } catch (error) { say(errorText(error), 'error'); }
    render();
  }

  async function loadOptions() {
    if (!state.versionId) return;
    say(tr('Downloading and reading this version. This can take a minute…', '下載同讀取呢個版本，可能要一分鐘…'));
    try {
      state.options = await request('worldOptions', {versionId: state.versionId});
      if (state.options.worldPresets?.length && !state.options.worldPresets.includes(state.worldType)) state.worldType = state.options.worldPresets.includes('minecraft:normal') ? 'minecraft:normal' : state.options.worldPresets[0];
      const gaps = state.options.gaps ?? [];
      say(gaps.length ? tr('Some options are unavailable for this version: ', '呢個版本有啲選項用唔到：') + gaps.map(gap => gap.reason).join(' ') : tr('Options for this version are ready.', '呢個版本嘅選項已經準備好。'), gaps.length ? 'error' : '');
    } catch (error) { state.options = null; say(errorText(error), 'error'); }
    render();
  }

  async function pickDestination() {
    try {
      const picked = await request('pickWorldDestination', {kind: state.outputKind});
      if (picked) { state.destination = picked; render(); }
    } catch (error) { say(errorText(error), 'error'); }
  }

  function payload() {
    const request_ = {versionId: state.versionId, seed: state.seed, levelName: state.levelName, worldType: state.worldType, widthChunks: state.area.width, depthChunks: state.area.depth, centerChunkX: state.area.centerX, centerChunkZ: state.area.centerZ,
      difficulty: state.difficulty, gamemode: state.gamemode, hardcore: state.hardcore, generateStructures: state.structures, borderFollowsArea: state.borderFollows, eulaAccepted: state.eula, gamerules: state.gamerules,
      output: {kind: state.outputKind, destinationId: state.destination?.destinationId}};
    const tweaks = {};
    if (state.flat.enabled) tweaks.flat = {biome: state.flat.biome, features: state.flat.features, lakes: state.flat.lakes, layers: state.flat.layers};
    if (state.singleBiome) tweaks.singleBiome = state.singleBiome;
    const noise = {};
    if (state.noise.seaLevel !== '') noise.seaLevel = Number(state.noise.seaLevel);
    if (state.noise.oreVeins === false) noise.oreVeins = false;
    if (state.noise.aquifers === false) noise.aquifers = false;
    if (state.noise.mobGeneration === false) noise.mobGeneration = false;
    if (Object.keys(noise).length) tweaks.noise = noise;
    if (Object.keys(tweaks).length) request_.tweaks = tweaks;
    return request_;
  }

  async function start() {
    try { const job = await request('startWorldGeneration', payload()); state.job = validJob(job) ? job : null; say(tr('Generation started.', '已開始產生。')); }
    catch (error) { say(errorText(error), 'error'); }
    render();
  }

  async function refreshJob() {
    try { const job = await request('worldGenerationStatus', {}); state.job = validJob(job) ? job : null; } catch { return; }
    if (!alive) return;
    updateProgress();
    if (state.job && state.job.status !== 'running') render();
  }

  function updateProgress() {
    const bar = section.querySelector('[data-role="progress"]'), label = section.querySelector('[data-role="stage"]'), log = section.querySelector('[data-role="log"]');
    const job = state.job;
    if (!job) return;
    if (bar) { bar.max = Math.max(1, job.progress.batches); bar.value = job.progress.done; }
    if (label) label.textContent = tr(...(STAGE_LABELS[job.stage] ?? [job.stage, job.stage])) + (job.progress.batches ? ' · ' + job.progress.done + ' / ' + job.progress.batches + tr(' batches', ' 批') : '');
    if (log) log.textContent = job.log.slice(-12).join('\n');
  }

  function drawCanvas() {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    const size = canvas.width, g = canvas.getContext('2d');
    if (!g) return;
    const css = typeof getComputedStyle === 'function' ? getComputedStyle(section) : {getPropertyValue: () => ''};
    g.clearRect(0, 0, size, size);
    const rect = toCanvas(state.area, size);
    g.strokeStyle = css.getPropertyValue('--md-sys-color-outline-variant') || '#999';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = size / 2 % (50 * rect.scale); x < size; x += 50 * rect.scale) { g.moveTo(x, 0); g.lineTo(x, size); }
    for (let y = size / 2 % (50 * rect.scale); y < size; y += 50 * rect.scale) { g.moveTo(0, y); g.lineTo(size, y); }
    g.stroke();
    g.fillStyle = (css.getPropertyValue('--md-sys-color-primary') || '#3366cc').trim() + '40';
    g.strokeStyle = css.getPropertyValue('--md-sys-color-primary') || '#3366cc';
    g.lineWidth = 2;
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.strokeRect(rect.x, rect.y, rect.w, rect.h);
    g.fillStyle = g.strokeStyle;
    g.fillRect(rect.x + rect.w - 6, rect.y + rect.h - 6, 12, 12);
    g.beginPath(); g.arc(size / 2, size / 2, 3, 0, Math.PI * 2); g.fill();
  }

  function updateReadout() {
    const node = section.querySelector('[data-role="readout"]');
    if (!node) return;
    const b = blocks(state.area), bounds = areaBounds(state.area);
    node.textContent = state.area.width + ' × ' + state.area.depth + tr(' chunks', ' 個區塊') + ' = ' + b.x + ' × ' + b.z + tr(' blocks', ' 個方塊') + ' · ' + tr('chunks ', '區塊 ') + bounds.minX + ',' + bounds.minZ + ' → ' + (bounds.maxX - 1) + ',' + (bounds.maxZ - 1) + ' · ' + tr('about ', '大約 ') + Math.ceil(state.area.width / 16) * Math.ceil(state.area.depth / 16) + tr(' forceload batches', ' 批強制載入');
  }

  function renderArea(parent) {
    const box = plain('fieldset', 'studio-fieldset');
    box.append(plain('legend', '', tr('Size of the world to generate', '要產生嘅世界大小')));
    const row = plain('div', 'studio-row');
    const width = kit.textField('Width (chunks)', '闊度（區塊）', String(state.area.width), value => { state.area = createArea({...state.area, width: Number(value) || 1}); drawCanvas(); updateReadout(); }, {type: 'number'});
    const depth = kit.textField('Depth (chunks)', '深度（區塊）', String(state.area.depth), value => { state.area = createArea({...state.area, depth: Number(value) || 1}); drawCanvas(); updateReadout(); }, {type: 'number'});
    row.append(width, depth);
    box.append(row);
    canvas = kit.doc.createElement('canvas');
    canvas.width = 400; canvas.height = 400; canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', tr('World area. Arrow keys move the area, Shift with arrow keys resizes it.', '世界範圍。方向鍵移動範圍，Shift 加方向鍵調整大小。'));
    let drag = null;
    const toLocal = event => { const r = canvas.getBoundingClientRect(); return [(event.clientX - r.left) * canvas.width / r.width, (event.clientY - r.top) * canvas.height / r.height]; };
    canvas.addEventListener('pointerdown', event => { const [x, y] = toLocal(event); const mode = hitTest(state.area, canvas.width, x, y); if (mode) { drag = {mode, x, y, start: state.area}; canvas.setPointerCapture?.(event.pointerId); } });
    canvas.addEventListener('pointermove', event => {
      if (!drag) return;
      const [x, y] = toLocal(event), dx = pixelsToChunks(x - drag.x, drag.start, canvas.width), dz = pixelsToChunks(y - drag.y, drag.start, canvas.width);
      state.area = drag.mode === 'move' ? moveBy(drag.start, dx, dz) : resizeBy(drag.start, dx * 2, dz * 2);
      if (drag.mode === 'resize') { width.value = String(state.area.width); depth.value = String(state.area.depth); }
      drawCanvas(); updateReadout();
    });
    const end = () => { drag = null; };
    canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', event => { const next = keyboard(state.area, event.key, event.shiftKey); if (next) { event.preventDefault(); state.area = next; width.value = String(next.width); depth.value = String(next.depth); drawCanvas(); updateReadout(); } });
    box.append(canvas);
    const readout = plain('p', 'studio-lede'); readout.dataset.role = 'readout'; box.append(readout);
    box.append(kit.toggle('World border follows the area', '世界邊界跟住範圍', state.borderFollows, value => { state.borderFollows = value; }));
    parent.append(box);
    drawCanvas(); updateReadout();
  }

  function renderCustomization(parent) {
    const options = state.options;
    const box = plain('fieldset', 'studio-fieldset');
    box.append(plain('legend', '', tr('World type and customization', '世界類型同自訂')));
    if (!options) { box.append(plain('p', '', tr('Extract the options for this version first.', '請先讀取呢個版本嘅選項。'))); parent.append(box); return; }
    if (options.legacy) { box.append(plain('p', '', options.gaps[0].reason)); parent.append(box); return; }
    if (!options.worldPresets.length) { box.append(plain('p', 'studio-status', tr('No world presets were produced for this version, so these controls stay unavailable. ', '呢個版本冇產生世界預設，所以呢啲控制項用唔到。') + options.gaps.map(gap => gap.reason).join(' '))); parent.append(box); return; }
    box.append(kit.select('World preset', '世界預設', options.worldPresets.map(id => [id, id.replace(/^minecraft:/, '')]), state.worldType, value => { state.worldType = value; }));
    box.append(kit.toggle('Superflat layers', '超平坦圖層', state.flat.enabled, value => { state.flat.enabled = value; render(); }));
    if (state.flat.enabled) {
      box.append(kit.select('Flat biome', '平坦生物群系', options.biomes.map(id => [id, id.replace(/^minecraft:/, '')]), state.flat.biome, value => { state.flat.biome = value; }));
      box.append(kit.toggle('Features', '地物', state.flat.features, value => { state.flat.features = value; }), kit.toggle('Lakes', '湖泊', state.flat.lakes, value => { state.flat.lakes = value; }));
      state.flat.layers.forEach((layer, index) => {
        const row = plain('div', 'studio-row');
        row.append(kit.select('Layer block ' + (index + 1), '圖層方塊 ' + (index + 1), options.blocks.map(id => [id, id.replace(/^minecraft:/, '')]), layer.block, value => { layer.block = value; }),
          kit.textField('Height', '高度', String(layer.height), value => { layer.height = Math.max(1, Math.min(384, Math.round(Number(value)) || 1)); }, {type: 'number'}),
          kit.button('Up', '上移', () => { if (index > 0) { [state.flat.layers[index - 1], state.flat.layers[index]] = [layer, state.flat.layers[index - 1]]; render(); } }, {disabled: index === 0}),
          kit.button('Down', '下移', () => { if (index < state.flat.layers.length - 1) { [state.flat.layers[index + 1], state.flat.layers[index]] = [layer, state.flat.layers[index + 1]]; render(); } }, {disabled: index === state.flat.layers.length - 1}),
          kit.button('Take out layer', '拎走圖層', () => { if (state.flat.layers.length > 1) { state.flat.layers.splice(index, 1); render(); } }, {disabled: state.flat.layers.length <= 1}));
        box.append(row);
      });
      box.append(kit.button('Add a layer', '加一層', () => { state.flat.layers.push({block: options.blocks.includes('minecraft:stone') ? 'minecraft:stone' : options.blocks[0], height: 1}); render(); }, {disabled: state.flat.layers.length >= 64}));
    } else {
      box.append(kit.select('Single biome (optional)', '單一生物群系（可選）', [['', tr('Vanilla biomes', '原版生物群系')], ...options.biomes.map(id => [id, id.replace(/^minecraft:/, '')])], state.singleBiome, value => { state.singleBiome = value; }));
      box.append(kit.textField('Sea level (blank keeps the default)', '海平面（留空用預設）', state.noise.seaLevel, value => { state.noise.seaLevel = value.trim(); }, {type: 'number'}));
      box.append(kit.toggle('Aquifers', '含水層', state.noise.aquifers, value => { state.noise.aquifers = value; }), kit.toggle('Ore veins', '礦脈', state.noise.oreVeins, value => { state.noise.oreVeins = value; }), kit.toggle('Mob generation', '生物生成', state.noise.mobGeneration, value => { state.noise.mobGeneration = value; }));
    }
    parent.append(box);
  }

  function renderRules(parent) {
    const rules = state.options?.gamerules ?? [];
    if (!rules.length) return;
    const box = plain('fieldset', 'studio-fieldset');
    box.append(plain('legend', '', tr('Game rules for this version', '呢個版本嘅遊戲規則')));
    const list = plain('div', 'studio-col');
    const paint = () => {
      list.replaceChildren();
      const needle = state.ruleFilter.trim().toLowerCase();
      for (const rule of rules.filter(item => !needle || item.name.toLowerCase().includes(needle))) {
        if (rule.type === 'bool') list.append(kit.toggle(rule.name, rule.name, state.gamerules[rule.name] ?? undefined, value => { state.gamerules[rule.name] = value; }));
        else if (rule.type === 'integer') list.append(kit.textField(rule.name, rule.name, state.gamerules[rule.name] === undefined ? '' : String(state.gamerules[rule.name]), value => { if (value === '') delete state.gamerules[rule.name]; else state.gamerules[rule.name] = Math.round(Number(value)); }, {type: 'number'}));
        else list.append(plain('p', 'studio-lede', rule.name + ' · ' + tr('this rule has a type the manager cannot edit yet', '呢條規則嘅類型暫時未能編輯')));
      }
    };
    box.append(kit.textField('Filter game rules', '篩選遊戲規則', state.ruleFilter, value => { state.ruleFilter = value; paint(); }), list);
    paint();
    parent.append(box);
  }

  function render() {
    if (!alive) return;
    section.replaceChildren();
    section.setAttribute('aria-label', tr('World generator', '世界產生器'));
    section.append(plain('h2', '', tr('Minecraft world generator', 'Minecraft 世界產生器')), plain('p', 'studio-lede', tr('Generates a world with the official server for the version you choose. The server file comes only from Mojang and is checked against its published SHA-1. You must accept the Minecraft license yourself.', '用你揀嘅版本嘅官方伺服器產生世界。伺服器檔案只會由 Mojang 下載，並對照佢公佈嘅 SHA-1。你要自己接受 Minecraft 授權。')));
    const running = state.job?.status === 'running';
    const grid = plain('div', 'studio-grid'), left = plain('div', 'studio-col'), right = plain('div', 'studio-col');
    grid.append(left, right); section.append(grid);
    const versionRow = plain('div', 'studio-row');
    versionRow.append(kit.button(state.versions ? 'Reload official versions' : 'Load official versions', state.versions ? '重新載入官方版本' : '載入官方版本', loadVersions, {disabled: running}));
    if (state.versions) versionRow.append(kit.select('Version', '版本', state.versions.map(row => [row.id, row.id]), state.versionId, value => { state.versionId = value; state.options = null; render(); }),
      kit.button('Read options for this version', '讀取呢個版本嘅選項', loadOptions, {disabled: running || !state.versionId}));
    left.append(versionRow);
    left.append(kit.textField('Seed', '種子', state.seed, value => { state.seed = value; }), kit.textField('World folder name', '世界資料夾名稱', state.levelName, value => { state.levelName = value; }));
    left.append(kit.select('Difficulty', '難度', DIFFICULTIES.map(id => [id, id]), state.difficulty, value => { state.difficulty = value; }), kit.select('Game mode', '遊戲模式', GAME_MODES.map(id => [id, id]), state.gamemode, value => { state.gamemode = value; }),
      kit.toggle('Hardcore', '極限模式', state.hardcore, value => { state.hardcore = value; }), kit.toggle('Generate structures', '產生結構', state.structures, value => { state.structures = value; }));
    renderArea(left);
    renderCustomization(right);
    renderRules(right);

    const output = plain('fieldset', 'studio-fieldset');
    output.append(plain('legend', '', tr('Output', '輸出')));
    output.append(kit.select('Deliver as', '輸出方式', [['folder', tr('Folder', '資料夾')], ['zip', 'ZIP']], state.outputKind, value => { state.outputKind = value; state.destination = null; render(); }));
    output.append(kit.button(state.outputKind === 'zip' ? 'Browse for the ZIP file…' : 'Browse for a folder…', state.outputKind === 'zip' ? '瀏覽 ZIP 檔案…' : '瀏覽資料夾…', pickDestination, {disabled: running}));
    output.append(plain('p', 'studio-lede', state.destination ? state.destination.label : tr('Nothing chosen yet. Output never overwrites an existing world or file.', '未揀。輸出唔會覆蓋現有世界或檔案。')));
    output.append(kit.toggle('I accept the Minecraft End User License Agreement (minecraft.net/eula)', '我接受 Minecraft 使用者授權協議（minecraft.net/eula）', state.eula, value => { state.eula = value; render(); }));
    section.append(output);

    const actions = plain('div', 'studio-row');
    actions.append(kit.button('Generate the world', '產生世界', start, {variant: 'primary', disabled: running || !state.versionId || !state.options?.worldPresets?.length && !state.options?.legacy || !state.destination || !state.eula}),
      kit.button('Cancel generation', '取消產生', async () => { try { await request('abortWorldGeneration', {}); say(tr('Cancel requested.', '已要求取消。')); } catch (error) { say(errorText(error), 'error'); } }, {disabled: !running}));
    section.append(actions);
    const stage = plain('p', 'studio-lede'); stage.dataset.role = 'stage';
    const bar = kit.el('progress', {}); bar.dataset.role = 'progress'; bar.setAttribute('aria-label', tr('Generation progress', '產生進度'));
    const log = plain('pre'); log.dataset.role = 'log'; log.setAttribute('aria-label', tr('Server log', '伺服器記錄'));
    const status = kit.status(); status.dataset.role = 'status'; status.textContent = state.message; if (state.tone) status.dataset.tone = state.tone;
    section.append(stage, bar, status, log);
    if (state.job) {
      updateProgress();
      if (state.job.status === 'done') status.textContent = tr('Done. ', '完成。') + state.job.result.files + tr(' files delivered to ', ' 個檔案已交付到 ') + state.job.result.path;
      else if (state.job.status !== 'running') { status.textContent = state.job.reason ?? ''; status.dataset.tone = 'error'; }
    }
  }


  render();
  void request('worldGenerationStatus', {}).then(job => { if (alive && validJob(job)) { state.job = job; render(); } }, () => {});
  return {refresh: refreshJob, setLanguage: render, destroy() { alive = false; kit.destroy(); section.remove(); }};
}
