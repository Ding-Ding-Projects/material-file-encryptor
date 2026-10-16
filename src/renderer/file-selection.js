// Multi-selection model for the drive file list.
//
// `primary` is the entry shown in the details panel and opened by "Open"; `anchor`
// is where a Shift range starts. Everything here works on ids and on the ordered list
// of ids currently visible, so filtering never leaves a hidden entry selected.

export function createFileSelection() {
  const ids = new Set();
  let primary = null, anchor = null;
  const api = {
    get size() { return ids.size; },
    get primary() { return primary; },
    get anchor() { return anchor; },
    has: id => ids.has(id),
    /** Selected ids in the order the list shows them. */
    list: ordered => ordered.filter(id => ids.has(id)),
    /** Plain click: this entry only. */
    only(id) { ids.clear(); ids.add(id); primary = anchor = id; },
    /** Checkbox or Ctrl+click: flip one entry and make it the anchor. */
    toggle(id, force) {
      const on = force ?? !ids.has(id);
      if (on) { ids.add(id); primary = id; } else { ids.delete(id); if (primary === id) primary = ids.size ? [...ids].at(-1) : null; }
      anchor = id;
    },
    /** Shift+click or Shift+Space: everything between the anchor and this entry, in list order. */
    range(ordered, id, {additive = false} = {}) {
      const to = ordered.indexOf(id);
      if (to < 0) return;
      const from = anchor !== null && ordered.includes(anchor) ? ordered.indexOf(anchor) : to;
      if (!additive) ids.clear();
      for (const entry of ordered.slice(Math.min(from, to), Math.max(from, to) + 1)) ids.add(entry);
      primary = id;
      if (anchor === null) anchor = id;
    },
    selectAll(ordered) { for (const id of ordered) ids.add(id); if (ordered.length) { primary = primary !== null && ids.has(primary) ? primary : ordered[0]; anchor ??= ordered[0]; } },
    clear() { ids.clear(); primary = anchor = null; },
    /** Drops entries that are no longer in the list. */
    prune(valid) {
      const keep = new Set(valid);
      for (const id of [...ids]) if (!keep.has(id)) ids.delete(id);
      if (primary !== null && !ids.has(primary)) primary = ids.size ? [...ids].at(-1) : null;
      if (anchor !== null && !keep.has(anchor)) anchor = primary;
    },
    /** 'none', 'some' or 'all' of the visible entries, for the header checkbox. */
    coverage(ordered) {
      if (!ordered.length) return 'none';
      const count = ordered.filter(id => ids.has(id)).length;
      return count === 0 ? 'none' : count === ordered.length ? 'all' : 'some';
    }
  };
  return api;
}

/** What each bulk action may do for a set of selected files. */
export function bulkAvailability(files, {busy, unlocked, mounted}) {
  const count = files.length;
  const base = !busy && unlocked && count > 0;
  return {
    open: !busy && mounted && count === 1,
    export: !busy && mounted && count > 0,
    keepOffline: base && files.some(file => !file.offline),
    releaseOffline: base && files.some(file => file.offline),
    delete: !busy && mounted && count > 0
  };
}

/** Runs `task` for every item, continuing past failures, and throws one summary error afterwards. */
export async function runForEach(items, task) {
  const failures = [];
  let done = 0;
  for (const item of items) {
    try { await task(item); done += 1; }
    catch (error) { failures.push({item, message: String(error?.message || error)}); }
  }
  if (failures.length) {
    const error = new Error(`${failures.length} of ${items.length} could not be completed. ${failures[0].message}`);
    error.failures = failures; error.done = done;
    throw error;
  }
  return done;
}
