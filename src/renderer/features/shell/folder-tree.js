/** Pure helpers that turn the flat list of encrypted entry paths into a folder tree, a scoped listing and a sorted table. */

/** Splits a stored path into its non-empty segments, accepting both separators. */
export function splitPath(path) {
  return String(path ?? '').split(/[\\/]+/).filter(Boolean);
}

/** The file name without its folders. */
export function basename(path) {
  return splitPath(path).at(-1) ?? '';
}

/** Normalizes a folder path to forward slashes without leading or trailing separators. */
export function folderKey(path) {
  return splitPath(path).join('/');
}

/**
 * Builds a folder tree. Every node carries the number of files below it, so the tree can show
 * counts without a second pass. Files in the drive root are counted on the root node only.
 */
export function buildFolderTree(files) {
  const root = {name: '', path: '', depth: 0, count: 0, children: new Map()};
  for (const file of files || []) {
    const parts = splitPath(file?.path);
    root.count += 1;
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const name = parts[index];
      let child = node.children.get(name);
      if (!child) {
        child = {name, path: parts.slice(0, index + 1).join('/'), depth: index + 1, count: 0, children: new Map()};
        node.children.set(name, child);
      }
      child.count += 1;
      node = child;
    }
  }
  return root;
}

/** Flattens the tree into the visible rows for the given set of expanded folder paths. */
export function flattenFolderTree(root, expanded = new Set(), collator = new Intl.Collator('en', {numeric: true, sensitivity: 'base'})) {
  const rows = [];
  const visit = node => {
    const children = [...node.children.values()].sort((a, b) => collator.compare(a.name, b.name));
    for (const child of children) {
      const open = expanded.has(child.path);
      rows.push({path: child.path, name: child.name, depth: child.depth, count: child.count, hasChildren: child.children.size > 0, expanded: open});
      if (open) visit(child);
    }
  };
  visit(root);
  return rows;
}

/** Every ancestor of a folder path, so selecting a deep folder can reveal it in the tree. */
export function ancestorFolders(path) {
  const parts = splitPath(path);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** True when the file lives in the folder or any folder below it. The empty folder matches everything. */
export function fileInFolder(file, folder) {
  const key = folderKey(folder);
  if (!key) return true;
  const own = splitPath(file?.path).join('/');
  return own.startsWith(key + '/');
}

/** The name shown in the table: the path relative to the scoped folder. */
export function relativeName(file, folder) {
  const own = splitPath(file?.path).join('/');
  const key = folderKey(folder);
  return key && own.startsWith(key + '/') ? own.slice(key.length + 1) : own;
}

/** Breadcrumb segments for a folder path, each carrying the folder path it navigates to. */
export function breadcrumbs(folder) {
  const parts = splitPath(folder);
  return parts.map((name, index) => ({name, path: parts.slice(0, index + 1).join('/')}));
}

export const SORT_KEYS = Object.freeze(['name', 'availability', 'size', 'modified', 'parts']);

/** Returns a sorted copy. Unknown keys fall back to the name; equal keys keep a stable name order. */
export function sortFiles(files, {key = 'name', direction = 'asc'} = {}, locale = 'en') {
  const collator = new Intl.Collator(locale, {numeric: true, sensitivity: 'base'});
  const sign = direction === 'desc' ? -1 : 1;
  const value = {
    name: file => String(file.path ?? ''),
    availability: file => (file.offline ? 1 : 0),
    size: file => Number(file.size) || 0,
    modified: file => Date.parse(file.modified) || 0,
    parts: file => Number(file.partCount) || 0
  }[SORT_KEYS.includes(key) ? key : 'name'];
  return [...files].sort((a, b) => {
    const left = value(a), right = value(b);
    const order = typeof left === 'string' ? collator.compare(left, right) : left - right;
    return order !== 0 ? sign * order : collator.compare(String(a.path ?? ''), String(b.path ?? ''));
  });
}
