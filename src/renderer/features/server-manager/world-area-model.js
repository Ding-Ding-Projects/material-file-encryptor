/** Geometry for the world area canvas. The model works in chunks; the canvas only scales and draws it. */
export const VIEW_CHUNKS = 400;
export const MIN_CHUNKS = 1;
export const MAX_AXIS = 1000;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function createArea({width = 100, depth = 100, centerX = 0, centerZ = 0} = {}) {
  return {width: clamp(Math.round(width), MIN_CHUNKS, MAX_AXIS), depth: clamp(Math.round(depth), MIN_CHUNKS, MAX_AXIS), centerX: Math.round(centerX), centerZ: Math.round(centerZ)};
}

export const areaBounds = area => {
  const minX = area.centerX - Math.floor(area.width / 2), minZ = area.centerZ - Math.floor(area.depth / 2);
  return {minX, minZ, maxX: minX + area.width, maxZ: minZ + area.depth};
};

/** Pixels per chunk for a square canvas that shows VIEW_CHUNKS chunks, or more when the area is larger. */
export function scaleFor(size, area) {
  const span = Math.max(VIEW_CHUNKS, Math.max(area.width, area.depth) + 40);
  return size / span;
}

/** Canvas rectangle of the area, with the world origin at the canvas centre. */
export function toCanvas(area, size) {
  const scale = scaleFor(size, area), bounds = areaBounds(area);
  return {x: size / 2 + bounds.minX * scale, y: size / 2 + bounds.minZ * scale, w: area.width * scale, h: area.depth * scale, scale};
}

/** 'resize' near the bottom-right corner, 'move' inside the rectangle, otherwise null. */
export function hitTest(area, size, px, py, handle = 12) {
  const rect = toCanvas(area, size);
  if (Math.abs(px - (rect.x + rect.w)) <= handle && Math.abs(py - (rect.y + rect.h)) <= handle) return 'resize';
  if (px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h) return 'move';
  return null;
}

export function moveBy(area, dx, dz) {
  return createArea({...area, centerX: area.centerX + dx, centerZ: area.centerZ + dz});
}

export function resizeBy(area, dw, dd) {
  return createArea({...area, width: area.width + dw, depth: area.depth + dd});
}

/** Convert a pointer drag in pixels into a chunk delta. */
export const pixelsToChunks = (pixels, area, size) => Math.round(pixels / scaleFor(size, area));

/** The same rectangle expressed in blocks, for the readout. */
export const blocks = area => ({x: area.width * 16, z: area.depth * 16});

/** Keyboard: arrows move, Shift+arrows resize, in whole chunks. Returns the new area or null when the key is not handled. */
export function keyboard(area, key, shift) {
  const step = {ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]}[key];
  if (!step) return null;
  return shift ? resizeBy(area, step[0] * 2, step[1] * 2) : moveBy(area, step[0], step[1]);
}
