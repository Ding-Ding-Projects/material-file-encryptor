/**
 * Bulk actions for lists that are not the drive file list: history versions, the Recycle Bin, vault sessions and
 * notifications. The module owns three things and nothing else:
 *
 *  - a selection model that understands click, Ctrl+click, Shift+click ranges, honest select-all for what is shown,
 *    and inverse selection, always over the ids that are currently visible;
 *  - a runner that applies one action to every selected item, never stops at the first failure and reports what was
 *    done, what was skipped and why, and what failed;
 *  - a toolbar that states the exact selection count and scope in words and offers the selection commands.
 *
 * Destructive batches are confirmed by the caller before it calls the runner; this module never confirms for it.
 */

/** English and Cantonese wording shared by every list. Callers translate through their own pair or dictionary route. */
export const BULK_LABELS = Object.freeze({
  selectShown: ['Select all shown', '選取所有顯示嘅項目'],
  invert: ['Invert selection', '反轉選取'],
  clear: ['Clear selection', '清除選取'],
  nothingSelected: ['Nothing selected', '未選取任何項目'],
  toolbar: ['Bulk actions', '批次操作'],
  allDone: ['All selected items were processed.', '所有已選項目都處理完成。'],
  skippedHeading: ['Skipped', '已略過'],
  failedHeading: ['Failed', '失敗'],
  exportSelected: ['Export selected', '匯出所選項目'],
  exportedSelected: ['Exported selected', '已匯出所選項目'],
  versions: ['versions', '版本'],
  deletedEntries: ['deleted entries', '已刪除項目'],
  vaults: ['vaults', '保險庫'],
  manageVaults: ['Manage vaults', '管理保險庫'],
  removeLockedVaults: ['Remove selected locked vaults', '移除所選已鎖定保險庫'],
  mainVault: ['The main vault cannot be removed', '主保險庫不可以移除'],
  notLocked: ['Only a locked vault that is not mounted can be removed', '只可以移除已鎖定而且未掛載嘅保險庫'],
  needsRecovery: ['Finish the recovery first', '請先完成復原']
});

/** English to Cantonese pairs, for dictionaries keyed by the English text. */
export const BULK_COPY = Object.freeze(Object.fromEntries(Object.values(BULK_LABELS)));

export const bulkLabels = tr => Object.fromEntries(Object.entries(BULK_LABELS).map(([key, [en, yue]]) => [key, tr(en, yue)]));

/**
 * Selection over ordered ids. `ordered` is always the list as it is shown now, so filtering never leaves a hidden item
 * selected: call prune() after every render.
 */
export function createBulkSelection() {
  const ids = new Set();
  let anchor = null;
  const api = {
    get size() { return ids.size; },
    has: id => ids.has(id),
    ids: () => [...ids],
    list: ordered => ordered.filter(id => ids.has(id)),
    toggle(id, force) {
      const on = force ?? !ids.has(id);
      if (on) ids.add(id); else ids.delete(id);
      anchor = id;
    },
    /** Shift+click: everything between the anchor and this item, in list order. */
    range(ordered, id, {additive = true} = {}) {
      const to = ordered.indexOf(id);
      if (to < 0) return;
      const from = anchor !== null && ordered.includes(anchor) ? ordered.indexOf(anchor) : to;
      if (!additive) ids.clear();
      for (const entry of ordered.slice(Math.min(from, to), Math.max(from, to) + 1)) ids.add(entry);
      anchor ??= id;
    },
    /** Selects only what is shown. It never reaches items hidden by a filter or another page. */
    selectAll(ordered) { for (const id of ordered) ids.add(id); if (ordered.length) anchor ??= ordered[0]; },
    /** Inverse selection over what is shown; hidden items keep their state, which is empty after prune(). */
    invert(ordered) { for (const id of ordered) { if (ids.has(id)) ids.delete(id); else ids.add(id); } },
    clear() { ids.clear(); anchor = null; },
    prune(valid) {
      const keep = new Set(valid);
      for (const id of [...ids]) if (!keep.has(id)) ids.delete(id);
      if (anchor !== null && !keep.has(anchor)) anchor = null;
    },
    /** 'none', 'some' or 'all' of the shown items, for a header checkbox. */
    coverage(ordered) {
      if (!ordered.length) return 'none';
      const count = ordered.filter(id => ids.has(id)).length;
      return count === 0 ? 'none' : count === ordered.length ? 'all' : 'some';
    },
    /** A checkbox click that honours Shift. Returns the new state of the clicked item. */
    click(ordered, id, {shift = false, checked} = {}) {
      if (shift) { api.range(ordered, id); return true; }
      api.toggle(id, checked);
      return ids.has(id);
    }
  };
  return api;
}

/**
 * Applies `task` to every item. An item the caller marks as skipped is not run and is reported with its reason; an
 * item whose task throws is reported as failed; the batch always continues so one bad item never hides the rest.
 * Returns {done, skipped, failed, total}; nothing here throws for an item.
 */
export async function runBulk(items, task, {skip = () => null, signal} = {}) {
  const done = [], skipped = [], failed = [];
  for (const item of items) {
    if (signal?.aborted) { skipped.push({item, reason: 'cancelled'}); continue; }
    const reason = skip(item);
    if (reason) { skipped.push({item, reason: String(reason)}); continue; }
    try { await task(item); done.push(item); } catch (error) { failed.push({item, message: String(error?.message || error)}); }
  }
  return {done, skipped, failed, total: items.length};
}

/** One plain sentence for a finished batch: exact counts first, then every skipped and failed reason. */
export function summarizeBulk(result, {noun = 'items', describe = item => String(item?.id ?? item), labels = bulkLabels((en) => en)} = {}) {
  const parts = [`${result.done.length} / ${result.total} ${noun}`];
  if (!result.skipped.length && !result.failed.length) return `${labels.allDone} ${parts[0]}.`;
  if (result.skipped.length) parts.push(`${labels.skippedHeading}: ${result.skipped.map(row => `${describe(row.item)} (${row.reason})`).join('; ')}`);
  if (result.failed.length) parts.push(`${labels.failedHeading}: ${result.failed.map(row => `${describe(row.item)} (${row.message})`).join('; ')}`);
  return parts.join('. ');
}

/** The exact count and scope the toolbar announces: how many are selected of how many are shown. */
export function selectionStatus(selected, shown, {noun = 'items', labels = bulkLabels((en) => en)} = {}) {
  return selected ? `${selected} / ${shown} ${noun}` : `${labels.nothingSelected} (${shown} ${noun})`;
}

/**
 * Builds the selection toolbar and returns its controller.
 *
 * `actions` are extra buttons (restore, export, remove) the caller owns; the toolbar only enables them while
 * something is selected and reports their label with the exact count, so a preview of the batch size is always visible.
 */
export function mountBulkBar({doc = globalThis.document, host, labels = bulkLabels((en) => en), noun = 'items', ariaLabel, selection, getShown, onChange = () => {}, actions = [], controlTag = 'md-text-button'} = {}) {
  if (!doc || !host || !selection || typeof getShown !== 'function') throw Error('A bulk bar needs a document, host, selection and shown-list reader.');
  const bar = doc.createElement('div');
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', ariaLabel || labels.toolbar);
  bar.setAttribute('class', 'bulk-bar');
  const status = doc.createElement('span');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.setAttribute('class', 'bulk-status');
  const report = doc.createElement('p');
  report.setAttribute('role', 'status');
  report.setAttribute('class', 'bulk-report');
  report.hidden = true;
  const button = (text, handler) => {
    const node = doc.createElement(controlTag);
    node.setAttribute('type', 'button');
    node.textContent = text;
    node.addEventListener('click', handler);
    return node;
  };
  const selectShown = button(labels.selectShown, () => { selection.selectAll(getShown()); refresh(); });
  const invert = button(labels.invert, () => { selection.invert(getShown()); refresh(); });
  const clear = button(labels.clear, () => { selection.clear(); refresh(); });
  const extra = actions.map(action => ({action, node: button(action.label, async () => { await action.run(); refresh(); })}));
  bar.append(status, selectShown, invert, clear, ...extra.map(row => row.node));
  host.append(bar, report);
  function refresh() {
    const shown = getShown(), picked = selection.list(shown).length;
    status.textContent = selectionStatus(picked, shown.length, {noun, labels});
    selectShown.disabled = shown.length === 0;
    invert.disabled = shown.length === 0;
    clear.disabled = selection.size === 0;
    for (const {action, node} of extra) {
      node.disabled = picked === 0 || (typeof action.enabled === 'function' && !action.enabled(selection.list(shown)));
      node.textContent = picked ? `${action.label} (${picked})` : action.label;
    }
    onChange({selected: picked, shown: shown.length});
    return picked;
  }
  refresh();
  return {
    bar, status, report, refresh,
    /** Shows the finished-batch sentence beside the toolbar. An empty string hides it. */
    showReport(text) { report.textContent = text || ''; report.hidden = !text; },
    destroy() { bar.remove(); report.remove(); }
  };
}
