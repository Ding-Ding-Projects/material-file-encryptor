// Live charts view. Charts show only what the application has actually reported while this window was open:
// drive used space (sum of file sizes from each state update) and operation progress. Nothing is simulated.
import {withIcon} from '../../icons.js';
import { createLiveChart } from '../../../shared/surface/live-chart.js';
import { formatBytes } from '../../../shared/toolbox/chart-scale.js';
import { el, createLabels } from '../toolbox-common.js';

const FINISHED = new Set(['completed', 'cancelled', 'failed']);

export function mountLiveCharts(root, { getLanguage = () => 'en' } = {}) {
  const labels = createLabels(getLanguage), { tr } = labels;
  root.replaceChildren();
  const view = el('section', { class: 'toolbox-view', 'aria-labelledby': 'charts-title' });
  const title = labels.text(el('h2', { id: 'charts-title' }), 'Live charts', '即時圖表');
  const note = labels.text(el('p', { class: 'toolbox-note' }), 'Values appear as the application reports them. Open this view before a sync or import to watch it, and unlock a drive to see used space.', '數值會喺程式回報時顯示。想睇同步或匯入，請先開呢個畫面；解鎖磁碟先會顯示已用空間。');
  const storageHost = el('div'), progressHost = el('div');
  const storage = createLiveChart(storageHost, { title: { en: 'Drive used space', yue: '磁碟已用空間' }, format: formatBytes, getLanguage, copy: { empty: { en: 'Unlock a drive to see its used space.', yue: '解鎖磁碟後會顯示已用空間。' } } });
  const progress = createLiveChart(progressHost, { title: { en: 'Operation progress', yue: '操作進度' }, unit: '%', format: v => String(Math.round(v)), getLanguage, staleAfterMs: 120000, copy: { empty: { en: 'No operation has run since this view opened.', yue: '呢個畫面開啟後未有操作執行。' } } });
  const historyTitle = labels.text(el('h3'), 'Transfer history (this session)', '傳輸記錄（今次使用期間）');
  const historyList = el('ol'), historyEmpty = labels.text(el('p', { class: 'toolbox-note' }), 'No operations have finished yet.', '暫時未有已完成嘅操作。');
  const pause = el('button', { type: 'button', class: 'toolbox-button', 'aria-pressed': 'false' }); labels.text(pause, 'Pause charts', '暫停圖表'); withIcon(pause, 'pause');
  let paused = false; pause.addEventListener('click', () => { paused = !paused; pause.setAttribute('aria-pressed', String(paused)); labels.text(pause, paused ? 'Resume charts' : 'Pause charts', paused ? '繼續圖表' : '暫停圖表'); storage.setMode(paused ? 'paused' : 'live'); progress.setMode(paused ? 'paused' : 'live'); });
  view.append(title, note, el('div', { class: 'toolbox-row' }, [pause]), storageHost, progressHost, historyTitle, historyEmpty, historyList);
  root.append(view);

  const seen = new Map(); const finished = [];
  let lastUsed = null;
  const api = {
    /** Call with the sum of file sizes whenever the drive state changes. `null` means locked or unknown. */
    reportUsedBytes(bytes) {
      if (paused || !Number.isFinite(bytes) || bytes === lastUsed) return;
      lastUsed = bytes; storage.push(Date.now(), bytes);
    },
    /** Call with the current operation rows. Progress is plotted only when a row reports a numeric percentage. */
    reportOperations(rows) {
      const now = Date.now();
      for (const row of rows || []) {
        const id = row.operationId || row.id; if (!id) continue;
        const state = row.state || row.status, label = row.label || row.type || id;
        if (!seen.has(id)) seen.set(id, { label, started: now });
        const entry = seen.get(id);
        if (Number.isFinite(row.progress) && !FINISHED.has(state) && !paused) progress.push(now, row.progress);
        if (FINISHED.has(state) && !entry.done) {
          entry.done = true; finished.unshift({ label: entry.label, state, seconds: Math.max(0, Math.round((now - entry.started) / 1000)) });
          if (Number.isFinite(row.progress) && state === 'completed' && !paused) progress.push(now, 100);
          renderHistory();
        }
      }
    },
    refreshLanguage() { labels.refresh(); storage.refreshLanguage(); progress.refreshLanguage(); renderHistory(); },
    destroy() { storage.destroy(); progress.destroy(); root.replaceChildren(); },
  };
  function renderHistory() {
    historyEmpty.hidden = finished.length > 0;
    historyList.replaceChildren(...finished.slice(0, 30).map(row => el('li', { text: `${row.label} · ${tr(row.state, row.state === 'completed' ? '完成' : row.state === 'failed' ? '失敗' : '已取消')} · ${row.seconds}s` })));
  }
  return api;
}
