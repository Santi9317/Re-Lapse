/**
 * What this publish says is new. Write these for someone using the camera.
 * One short line each, and only the lines for this publish.
 * Do not invent lines for publishes that shipped without them.
 * Keep public/release.json in step with this list, and keep its version equal to APP_VERSION.
 */
export const RELEASE_NOTES = [
  "Sign the back of a gallery photo you shot.",
  "Save a changed album title, or leave if unchanged, and return to Keepsakes. A blank title or a failed save stays and shows the error.",
  "The Feed dot and the Home Screen count include someone else's new photo, a note you did not write, or a pin you did not place.",
  "The new photo, note, and pin leave the Feed dot and the Home Screen count once the Feed list has loaded, and stay off while Feed is open.",
  "An emoji you did not place keeps a cyan ring until that look ends.",
  "A frame with a note you did not write keeps that cyan outline until you open the back. Scrolling past the front leaves it.",
  "Keepsakes does not get a mark for these.",
  "The Shoot preview is the same paper print the shutter saves.",
] as const;

export type PublishedRelease = {
  version: string;
  notes: readonly string[];
};

export function publishedReleaseFromJson(data: unknown): PublishedRelease | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { version?: unknown; notes?: unknown };
  if (typeof record.version !== "string" || record.version.length === 0) return null;
  if (!Array.isArray(record.notes) || !record.notes.every((line) => typeof line === "string")) return null;
  const notes = record.notes.map((line) => line.trim()).filter((line) => line.length > 0);
  return { version: record.version, notes };
}

/** The "what's new" control, once per publish, and only when that publish wrote notes. */
export function notesControlForUpdate(input: {
  published: PublishedRelease | null;
  bundledVersion: string;
  bundledNotes: readonly string[];
  seen: string | null;
}): { version: string; notes: readonly string[] } | null {
  if (input.published) {
    if (input.published.notes.length === 0) return null;
    if (input.seen === input.published.version) return null;
    return { version: input.published.version, notes: input.published.notes };
  }
  if (input.bundledNotes.length === 0) return null;
  if (!input.bundledVersion || input.seen === input.bundledVersion) return null;
  return { version: input.bundledVersion, notes: input.bundledNotes };
}

/**
 * Show that control when the camera opens, including when no service worker is waiting.
 * The update dialog already carries it, so this sheet stays down while that dialog is up.
 * Wait until the update check settles so the two sheets do not stack, and let Home Screen prompts go first.
 */
export function notesPromptOnEntry(input: {
  offer: { notes: readonly string[] } | null;
  updateOpen: boolean;
  updateSettled: boolean;
  blocked: boolean;
}): boolean {
  if (!input.offer || input.offer.notes.length === 0) return false;
  if (input.updateOpen || !input.updateSettled || input.blocked) return false;
  return true;
}
