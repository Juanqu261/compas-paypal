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
export const MAX_SCALE = 0.9;
/** Below this, text on the screen gets too small to read: the page scrolls instead. */
export const MIN_SCALE = 0.75;
/** What the device shares the window with: the person's name above it and some air. */
export const RESERVED_HEIGHT = 176;

/** The device's scale for a window height: as large as fits, between the two limits. */
export function deviceScale(windowHeight: number): number {
  const fit = (windowHeight - RESERVED_HEIGHT) / DEVICE_HEIGHT;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
}
