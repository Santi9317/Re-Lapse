/**
 * A shortcut keeps the picture it stored for an icon URL.
 * This publish asks for the same artwork at a new URL. Install of the
 * waiting worker fetches that picture and does not call skipWaiting, so an
 * open camera is left alone. The next full open is when the shortcut can
 * request the new URL. The gate has its own URL and keeps the shutter.
 */
export const SHORTCUT_ICON_FILES = [
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "gate-apple-touch-icon.png",
  "gate-192.png",
  "gate-512.png",
] as const;

export type ShortcutIconFile = (typeof SHORTCUT_ICON_FILES)[number];

const FILES = new Set<string>(SHORTCUT_ICON_FILES);

export function shortcutIconPath(version: string, file: ShortcutIconFile): string {
  return `/icons/shortcut/${version}/${file}`;
}

export function appShortcutIcons(version: string) {
  return {
    apple: shortcutIconPath(version, "apple-touch-icon.png"),
    any192: shortcutIconPath(version, "icon-192.png"),
    any512: shortcutIconPath(version, "icon-512.png"),
  };
}

export function gateShortcutIcons(version: string) {
  return {
    apple: shortcutIconPath(version, "gate-apple-touch-icon.png"),
    any192: shortcutIconPath(version, "gate-192.png"),
    any512: shortcutIconPath(version, "gate-512.png"),
  };
}

/** Public file for a versioned shortcut icon, or null when the path is not one. */
export function shortcutIconDestination(pathname: string): string | null {
  const match = /^\/icons\/shortcut\/\d+\.\d+\/([a-z0-9.-]+\.png)$/.exec(pathname);
  if (!match || !FILES.has(match[1])) return null;
  return `/icons/${match[1]}`;
}
