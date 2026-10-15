/**
 * Pure placement maths for floating menus. Given the anchor rectangle and the viewport it returns where the menu's
 * reference point goes, which corner of the menu sits on it, and the tallest the menu may be so that it never
 * leaves the viewport. The menu scrolls its list internally when its content is taller than `maxHeight`.
 */
export const MENU_INSET = 8;
export const MENU_GAP = 4;
export const MENU_MIN_HEIGHT = 160;
export const MENU_COMFORT_HEIGHT = 280;
export const MENU_DEFAULT_WIDTH = 440;

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

/**
 * @param {{left:number,right:number,top:number,bottom:number}} anchorRect
 * @param {{width:number,height:number}} viewport
 * @param {{align?:'start'|'end', inset?:number, gap?:number, menuWidth?:number, minHeight?:number, comfortHeight?:number}} [options]
 * @returns {{x:number,y:number,flip:boolean,alignEnd:boolean,maxHeight:number,maxWidth:number}}
 */
export function placeMenu(anchorRect, viewport, {align = 'start', inset = MENU_INSET, gap = MENU_GAP, menuWidth = MENU_DEFAULT_WIDTH, minHeight = MENU_MIN_HEIGHT, comfortHeight = MENU_COMFORT_HEIGHT} = {}) {
  const width = Math.max(0, viewport.width), height = Math.max(0, viewport.height);
  const availableHeight = Math.max(0, height - 2 * inset), availableWidth = Math.max(0, width - 2 * inset);
  const below = height - anchorRect.bottom - gap - inset;
  const above = anchorRect.top - gap - inset;
  const flip = below < Math.min(comfortHeight, availableHeight) && above > below;
  const room = flip ? above : below;
  const maxHeight = Math.floor(Math.min(availableHeight, Math.max(room, Math.min(minHeight, availableHeight))));
  const effectiveWidth = Math.min(menuWidth, availableWidth);
  const alignEnd = align === 'end';
  const x = alignEnd
    ? clamp(anchorRect.right, inset + effectiveWidth, width - inset)
    : clamp(anchorRect.left, inset, width - inset - effectiveWidth);
  const edge = flip ? anchorRect.top - gap : anchorRect.bottom + gap;
  // When both sides are tight the menu may overlap the anchor rather than leave the viewport.
  const y = flip ? clamp(edge, inset + maxHeight, height - inset) : clamp(edge, inset, height - inset - maxHeight);
  return {x, y, flip, alignEnd, maxHeight, maxWidth: Math.floor(effectiveWidth)};
}

/** Corner of the menu that sits on the reference point: top when opening downward, bottom when flipped above. */
export function menuCorner({flip, alignEnd}) {
  return `${flip ? 'end' : 'start'}-${alignEnd ? 'end' : 'start'}`;
}
