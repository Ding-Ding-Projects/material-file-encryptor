/**
 * Width classes for the shell. Text size zooms the layout, so a 1280 px window at 200% lays out like a 640 px one.
 * Media queries only see the window, so the shell sets one attribute per breakpoint from the zoomed width instead,
 * and its stylesheet reads those attributes. At 100% they match the media queries exactly.
 */
export const BREAKPOINTS = Object.freeze([1100, 960, 839, 560, 400]);

/** The effective layout width in CSS pixels for a window width and text scale (1 = 100%). */
export function effectiveWidth(windowWidth, scale = 1) {
  const width = Number(windowWidth), factor = Number(scale);
  if (!Number.isFinite(width) || width <= 0) return 0;
  return width / (Number.isFinite(factor) && factor > 0 ? factor : 1);
}

/** The breakpoints that apply to an effective width (the window is at most that wide). */
export function activeBreakpoints(width) {
  return BREAKPOINTS.filter(limit => width <= limit);
}

/** Writes data-max<N> attributes on the root and on the elements that style themselves from a host attribute. */
export function applyViewportClasses(root, width, hosts = []) {
  const active = new Set(activeBreakpoints(width));
  for (const limit of BREAKPOINTS) root.toggleAttribute(`data-max${limit}`, active.has(limit));
  for (const host of hosts) host?.toggleAttribute?.('data-narrow', active.has(839));
  return [...active];
}
