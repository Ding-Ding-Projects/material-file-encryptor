// Small shared helpers for the toolbox views: bilingual text, element builders and chunked saving.
export function createCopy(getLanguage = () => 'en') {
  return (en, yue) => { const lang = getLanguage(); return lang === 'yue' ? yue : lang === 'bilingual' && yue !== en ? `${en} · ${yue}` : en; };
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node && key !== 'list') node[key] = value; else node.setAttribute(key, value);
  }
  node.append(...children.filter(Boolean));
  return node;
}

/** Keeps bilingual strings fresh: register (node, en, yue, attribute?) once, call refresh() when the language changes. */
export function createLabels(getLanguage) {
  const tr = createCopy(getLanguage), items = [];
  return {
    tr,
    text(node, en, yue) { items.push([node, en, yue, null]); node.textContent = tr(en, yue); return node; },
    attr(node, name, en, yue) { items.push([node, en, yue, name]); node.setAttribute(name, tr(en, yue)); return node; },
    refresh() { for (const [node, en, yue, name] of items) { const value = tr(en, yue); if (name) node.setAttribute(name, value); else node.textContent = value; } },
  };
}

export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Save a Blob through the native save dialog in 4 MiB chunks. Falls back to a browser download when the bridge is absent. */
export async function saveBlob(api, blob, { name, filters, driveLetter } = {}) {
  if (!api?.featureRequest || !api?.toolboxWrite) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name || 'download'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { name, bytes: blob.size };
  }
  const target = await api.featureRequest('toolbox', 'beginSave', { name, filters, driveLetter });
  if (!target) return null;
  try {
    for (let offset = 0; offset < blob.size; offset += 4 * 1024 * 1024) await api.toolboxWrite(target.id, await blob.slice(offset, offset + 4 * 1024 * 1024).arrayBuffer());
    return await api.featureRequest('toolbox', 'finishSave', { id: target.id });
  } catch (error) { await api.featureRequest('toolbox', 'abortSave', { id: target.id }).catch(() => {}); throw error; }
}

