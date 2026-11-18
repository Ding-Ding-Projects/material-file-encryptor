/**
 * The file row an event belongs to. A keyboard menu event starts inside the row checkbox's shadow root,
 * where closest() cannot see the row, so the composed event path is searched first.
 */
export function fileRowFromPath(path, target) {
  for (const node of path || []) if (node?.localName === 'tr' && node.dataset?.fileId) return node;
  return target?.closest?.('tr[data-file-id]') ?? null;
}

/**
 * Updates a list of rows in place. Rows whose data did not change are kept as the same nodes, so a refresh
 * never steals keyboard focus, resets the scroll position or closes a menu anchored to a row. Only rows
 * whose signature changed are rebuilt, only rows out of order are moved, and rows that disappeared are removed.
 *
 *   container  the element holding the rows (a tbody)
 *   items      [{ key, signature }] in display order
 *   build(item) a fresh row element for one item
 * Returns { kept, built, removed } counts so callers and tests can see how little changed.
 */
export function patchRows(container, items, build) {
  const wanted = new Set(items.map(item => String(item.key)));
  const existing = new Map();
  let removed = 0;
  // Remove vanished rows first, so the rows that stay rarely need to move.
  for (const row of [...container.children]) {
    const key = row.dataset?.rowKey;
    if (key !== undefined && wanted.has(key) && !existing.has(key)) existing.set(key, row);
    else { row.remove(); removed++; }
  }
  const active = container.ownerDocument?.activeElement;
  let kept = 0, built = 0, cursor = container.firstElementChild;
  for (const item of items) {
    const key = String(item.key);
    let row = existing.get(key);
    if (row && row.dataset.rowSignature === item.signature) kept++;
    else {
      const next = build(item);
      next.dataset.rowKey = key; next.dataset.rowSignature = item.signature;
      if (row) {
        // Keep focus on the rebuilt row when the old one held it.
        const hadFocus = Boolean(active && row.contains?.(active));
        row.replaceWith(next);
        if (cursor === row) cursor = next;
        if (hadFocus) next.querySelector?.('input,button,[tabindex]')?.focus?.({ preventScroll: true });
      }
      row = next; built++;
    }
    if (row === cursor) cursor = cursor.nextElementSibling;
    else container.insertBefore(row, cursor);
  }
  return { kept, built, removed };
}
