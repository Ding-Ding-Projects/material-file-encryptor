// Pure drawing document model: shapes, undo/redo history and SVG serialisation. No DOM access.

export const TOOLS = Object.freeze(['pen', 'marker', 'eraser', 'line', 'rect', 'ellipse', 'arrow', 'text']);
const MAX_SHAPES = 5000;
const MAX_POINTS = 4000;

const num = (value, fallback = 0) => Number.isFinite(value) ? Math.round(value * 100) / 100 : fallback;
const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const colour = value => /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#000000';

export function normalizeShape(shape) {
  if (!shape || !TOOLS.includes(shape.tool)) throw new TypeError('Unknown drawing tool.');
  const base = { tool: shape.tool, color: colour(shape.color), width: Math.min(64, Math.max(1, num(shape.width, 3))) };
  if (shape.tool === 'pen' || shape.tool === 'marker' || shape.tool === 'eraser') {
    const points = (shape.points || []).slice(0, MAX_POINTS).map(p => [num(p[0]), num(p[1])]);
    if (!points.length) throw new TypeError('A stroke needs at least one point.');
    return { ...base, points };
  }
  if (shape.tool === 'text') return { ...base, x: num(shape.x), y: num(shape.y), text: String(shape.text || '').slice(0, 500), size: Math.min(200, Math.max(8, num(shape.size, 24))) };
  return { ...base, x1: num(shape.x1), y1: num(shape.y1), x2: num(shape.x2), y2: num(shape.y2), fill: shape.fill === true };
}

export function createHistory(initial = []) {
  let shapes = initial.map(normalizeShape);
  const undone = [];
  let revision = 0;
  const api = {
    get shapes() { return shapes; },
    get revision() { return revision; },
    get canUndo() { return shapes.length > 0; },
    get canRedo() { return undone.length > 0; },
    add(shape) {
      if (shapes.length >= MAX_SHAPES) throw new RangeError('The drawing has reached its shape limit.');
      shapes = [...shapes, normalizeShape(shape)]; undone.length = 0; revision++; return shapes.length;
    },
    undo() { if (!shapes.length) return false; undone.push(shapes[shapes.length - 1]); shapes = shapes.slice(0, -1); revision++; return true; },
    redo() { if (!undone.length) return false; shapes = [...shapes, undone.pop()]; revision++; return true; },
    clear() { if (!shapes.length) return false; undone.length = 0; shapes = []; revision++; return true; },
    toJSON() { return { version: 1, shapes }; },
  };
  return api;
}

export function restoreHistory(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  if (parsed?.version !== 1 || !Array.isArray(parsed.shapes)) throw new TypeError('Unsupported drawing file.');
  return createHistory(parsed.shapes);
}

function shapeToSvg(shape) {
  const stroke = `stroke="${shape.color}" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (shape.tool) {
    case 'pen': case 'marker': {
      const opacity = shape.tool === 'marker' ? ' stroke-opacity="0.45"' : '';
      if (shape.points.length === 1) return `<circle cx="${shape.points[0][0]}" cy="${shape.points[0][1]}" r="${shape.width / 2}" fill="${shape.color}"${opacity}/>`;
      return `<polyline points="${shape.points.map(p => p.join(',')).join(' ')}" fill="none" ${stroke}${opacity}/>`;
    }
    case 'line': return `<line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}" ${stroke}/>`;
    case 'rect': return `<rect x="${Math.min(shape.x1, shape.x2)}" y="${Math.min(shape.y1, shape.y2)}" width="${Math.abs(shape.x2 - shape.x1)}" height="${Math.abs(shape.y2 - shape.y1)}" fill="${shape.fill ? shape.color : 'none'}" ${stroke}/>`;
    case 'ellipse': return `<ellipse cx="${(shape.x1 + shape.x2) / 2}" cy="${(shape.y1 + shape.y2) / 2}" rx="${Math.abs(shape.x2 - shape.x1) / 2}" ry="${Math.abs(shape.y2 - shape.y1) / 2}" fill="${shape.fill ? shape.color : 'none'}" ${stroke}/>`;
    case 'arrow': {
      const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1), head = Math.max(10, shape.width * 4);
      const a = [shape.x2 - head * Math.cos(angle - 0.45), shape.y2 - head * Math.sin(angle - 0.45)];
      const b = [shape.x2 - head * Math.cos(angle + 0.45), shape.y2 - head * Math.sin(angle + 0.45)];
      return `<g ${stroke} fill="none"><line x1="${shape.x1}" y1="${shape.y1}" x2="${shape.x2}" y2="${shape.y2}"/><polyline points="${num(a[0])},${num(a[1])} ${shape.x2},${shape.y2} ${num(b[0])},${num(b[1])}"/></g>`;
    }
    case 'text': return `<text x="${shape.x}" y="${shape.y}" font-size="${shape.size}" fill="${shape.color}" font-family="sans-serif">${esc(shape.text)}</text>`;
    default: return '';
  }
}

/** Serialise exactly what is shown. The eraser is rendered as a white-or-background stroke so the export matches the canvas. */
export function toSvg(shapes, { width = 960, height = 600, background = '#ffffff' } = {}) {
  const w = Math.max(1, Math.min(8192, Math.floor(width))), h = Math.max(1, Math.min(8192, Math.floor(height)));
  const body = shapes.map(shape => shape.tool === 'eraser'
    ? shapeToSvg({ ...shape, tool: 'pen', color: background })
    : shapeToSvg(shape)).join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n  <rect width="100%" height="100%" fill="${colour(background)}"/>\n  ${body}\n</svg>\n`;
}

/** Snap an end point to a 45 degree angle or a square, used while Shift is held. */
export function constrainPoint(x1, y1, x2, y2, tool) {
  const dx = x2 - x1, dy = y2 - y1;
  if (tool === 'rect' || tool === 'ellipse') { const side = Math.max(Math.abs(dx), Math.abs(dy)); return [x1 + Math.sign(dx || 1) * side, y1 + Math.sign(dy || 1) * side]; }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), length = Math.hypot(dx, dy);
  return [num(x1 + length * Math.cos(angle)), num(y1 + length * Math.sin(angle))];
}
