/**
 * The screen's logical size. It keeps a current phone's proportions (about
 * 9:19.5) at the width the apps were laid out for, so they read well small.
 */
export const SCREEN_WIDTH = 340;
export const SCREEN_HEIGHT = 736;
export const BEZEL = 9;
export const DEVICE_WIDTH = SCREEN_WIDTH + 2 * BEZEL;
export const DEVICE_HEIGHT = SCREEN_HEIGHT + 2 * BEZEL;

/** The device is shown smaller than its logical size: it only has to look like a phone. */
export const MAX_SCALE = 0.8;
/** Below this, text on the screen gets too small to read: the page scrolls instead. */
export const MIN_SCALE = 0.7;
/** What a phone shares the window's height with: the person's name above it and some air. */
export const RESERVED_HEIGHT = 176;

/** The demo shows this many phones side by side. */
export const PHONES_ACROSS = 3;
/** What they share the window's width with: the page's side margins and the gaps between phones. */
export const RESERVED_WIDTH = 128;

/**
 * The device's scale for a window: as large as fits both ways, between the two
 * limits. Height decides in a short window, width in a narrow one.
 */
export function deviceScale(windowHeight: number, windowWidth = Number.POSITIVE_INFINITY): number {
  const byHeight = (windowHeight - RESERVED_HEIGHT) / DEVICE_HEIGHT;
  const byWidth = (windowWidth - RESERVED_WIDTH) / (PHONES_ACROSS * DEVICE_WIDTH);
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(byHeight, byWidth)));
}
