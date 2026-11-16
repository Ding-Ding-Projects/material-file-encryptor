// Settings page behaviour: motion editor, sound, reading and wording, with search, per-group reset and reset all.
import {getMotion, setMotion, selectProfile, setKind, resetMotion, onMotionChange, previewKind, KINDS, PROFILE_NAMES} from './motion.js';
import {getSound, setSound, resetSound, playCue} from './sound.js';
import {loadReading, setReading, resetReading} from './reading.js';
import {mountRowSearch} from './search.js';
import {toast} from './toast.js';
import {pick} from './i18n.js';
import {setPressed} from './dom.js';

const $ = id => document.getElementById(id);
function syncMotion() {
 const state = getMotion();
 $('motion-mode').value = state.mode;
 $('motion-speed').value = state.speed;
 $('motion-speed-out').textContent = state.speed.toFixed(2) + '×';
 for (const chip of document.querySelectorAll('[data-profile]')) setPressed(chip, chip.dataset.profile === state.profile);
 for (const row of document.querySelectorAll('.motion-kind')) {
  const k = state.kinds[row.dataset.kind];
  row.querySelector('[data-kind-on]').checked = k.on;
  row.querySelector('[data-kind-dur]').value = k.dur;
  row.querySelector('[data-kind-dist]').value = k.dist;
  row.querySelector('[data-kind-ease]').value = k.ease;
 }
}
function mountMotionControls() {
 $('motion-mode').addEventListener('change', event => { setMotion({mode: event.target.value}); playCue('toggle'); toast(pick('Motion setting saved', '動畫設定已儲存')); });
 $('motion-speed').addEventListener('input', event => setMotion({speed: Number(event.target.value)}));
 for (const chip of document.querySelectorAll('[data-profile]')) chip.addEventListener('click', () => { selectProfile(chip.dataset.profile); toast(pick(`Profile: ${chip.dataset.profile}`, `設定檔：${chip.dataset.profile}`)); });
 for (const row of document.querySelectorAll('.motion-kind')) {
  const kind = row.dataset.kind;
  row.querySelector('[data-kind-on]').addEventListener('change', event => setKind(kind, {on: event.target.checked}));
  row.querySelector('[data-kind-dur]').addEventListener('change', event => setKind(kind, {dur: Math.min(3000, Math.max(0, Number(event.target.value) || 0))}));
  row.querySelector('[data-kind-dist]').addEventListener('change', event => setKind(kind, {dist: Math.min(80, Math.max(0, Number(event.target.value) || 0))}));
  row.querySelector('[data-kind-ease]').addEventListener('change', event => setKind(kind, {ease: event.target.value}));
  const target = document.createElement('span'); target.className = 'motion-preview'; target.hidden = true; target.textContent = pick('Preview', '預覽'); row.querySelector('[data-kind-preview]').after(target);
  row.querySelector('[data-kind-preview]').addEventListener('click', () => { if (!previewKind(kind, target)) toast(pick('Motion is off or reduced, so there is nothing to preview.', '動畫已關閉或減少，冇嘢預覽。')); });
 }
 onMotionChange(syncMotion);
 syncMotion();
}
function syncSound() { const s = getSound(); $('sound-on').checked = s.on; $('sound-volume').value = s.volume; }
function mountSoundControls() {
 $('sound-on').addEventListener('change', event => { setSound({on: event.target.checked}); if (event.target.checked) playCue('toggle'); });
 $('sound-volume').addEventListener('input', event => setSound({volume: Number(event.target.value)}));
 for (const button of document.querySelectorAll('[data-cue-test]')) button.addEventListener('click', () => { if (!playCue(button.dataset.cueTest, {force: true})) toast(pick('Sound is not available in this browser.', '呢個瀏覽器用唔到音效。'), {error: true}); });
 syncSound();
}
function syncReading() { const r = loadReading(); $('reading-width').value = r.width; $('reading-progress-on').checked = r.progress; }
function mountReadingControls() {
 $('reading-width').addEventListener('change', event => setReading({width: event.target.value}));
 $('reading-progress-on').addEventListener('change', event => setReading({progress: event.target.checked}));
 syncReading();
}
const RESETS = {motion: () => { resetMotion(); syncMotion(); }, sound: () => { resetSound(); syncSound(); }, reading: () => { resetReading(); syncReading(); }};
export async function mountSettingsPage() {
 if (!$('settings-groups')) return;
 mountMotionControls(); mountSoundControls(); mountReadingControls();
 // The shared foundation upgrades controls to Material components in more than one pass, so show the saved values again once it settles.
 const resync = () => { syncMotion(); syncSound(); syncReading(); };
 addEventListener('load', () => setTimeout(resync, 150), {once: true});
 setTimeout(resync, 600);
 $('open-preferences')?.addEventListener('click', () => $('preferences-open')?.click());
 for (const button of document.querySelectorAll('[data-reset-group]')) button.addEventListener('click', () => { RESETS[button.dataset.resetGroup]?.(); toast(pick('Group reset to its defaults', '呢組已重設為預設值')); });
 $('reset-all').addEventListener('click', () => { for (const reset of Object.values(RESETS)) reset(); toast(pick('All settings on this page were reset', '本頁所有設定已重設')); });
 const rows = [...document.querySelectorAll('.setting-row')].map((node, index) => ({id: String(index), node, text: `${node.dataset.settingText || ''} ${node.textContent}`.toLowerCase()}));
 const panel = document.querySelector('[data-site-search-settings]');
 await mountRowSearch(panel, {label: pick('Search settings', '搜尋設定'), id: 'modern-settings', rows: () => rows.map(({id, text}) => ({id, text})), apply: (ids, {query}) => {
  for (const row of rows) row.node.hidden = !!query && !ids.has(row.id);
  for (const group of document.querySelectorAll('.settings-group')) group.hidden = !!query && ![...group.querySelectorAll('.setting-row')].some(node => !node.hidden);
 }});
}
export {KINDS, PROFILE_NAMES};
