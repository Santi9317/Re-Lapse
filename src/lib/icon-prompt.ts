/**
 * Camera shortcut artwork for this publish and the one before it.
 * The digest covers the camera shortcut files, not the gate shutter.
 * The prompt shows only when the two digests differ.
 * When a later publish does not change those files, set both digests to the
 * previous publish's digest. When it does, move the old digest into
 * PREVIOUS_ICON_DIGEST and put the new one in ICON_DIGEST.
 * Keep public/release.json "icon" and "previousIcon" equal to these strings.
 */
export const APP_ICON_FILES = ["apple-touch-icon.png", "icon-192.png", "icon-512.png"] as const;

export const ICON_DIGEST = "0e6210f1bd3191d086e7c4deb1bb920768940cbf227f6f962125f415635d7665";
export const PREVIOUS_ICON_DIGEST = "0e6210f1bd3191d086e7c4deb1bb920768940cbf227f6f962125f415635d7665";

export const ICON_PROMPT_KICKER = "Home Screen";
export const ICON_PROMPT_TITLE = "Save the shortcut to the Home Screen again so the new icon appears.";
export const ICON_PROMPT_STEPS = [
  "Share",
  "Add to the Home Screen",
  "Remove the old shortcut if it is still there.",
] as const;
export const ICON_PROMPT_DISMISS = "Got it";

export type IconRelease = {
  version: string;
  icon: string;
  previousIcon: string;
};

export function bundledIconRelease(version: string): IconRelease {
  return { version, icon: ICON_DIGEST, previousIcon: PREVIOUS_ICON_DIGEST };
}

export function iconFilesChanged(icon: string, previousIcon: string): boolean {
  return icon.length > 0 && previousIcon.length > 0 && icon !== previousIcon;
}

export function iconReleaseFromJson(data: unknown): IconRelease | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { version?: unknown; icon?: unknown; previousIcon?: unknown };
  if (typeof record.version !== "string" || record.version.length === 0) return null;
  if (typeof record.icon !== "string" || record.icon.length === 0) return null;
  if (typeof record.previousIcon !== "string" || record.previousIcon.length === 0) return null;
  return { version: record.version, icon: record.icon, previousIcon: record.previousIcon };
}

/**
 * Ask once, on the open after an update whose icon files differ from the
 * previous publish. A first install has no waiting update and no pending
 * version, so it stays quiet. The sheet stays behind the update dialog.
 */
export function iconPromptPlan(input: {
  release: IconRelease | null;
  seen: string | null;
  pending: string | null;
  updateWaiting: boolean;
  justUpdated: boolean;
  blocked: boolean;
}): { pending: string | null; show: boolean } {
  const release = input.release;
  if (
    !release ||
    !iconFilesChanged(release.icon, release.previousIcon) ||
    release.version.length === 0 ||
    input.seen === release.version
  ) {
    return { pending: input.pending, show: false };
  }
  const version = release.version;
  const pending = input.updateWaiting || input.justUpdated || input.pending === version ? version : null;
  return { pending, show: pending === version && !input.blocked };
}
