/**
 * What this publish says is new. Write these for someone using the camera.
 * One short line each, and only the lines for this publish.
 * Do not invent lines for publishes that shipped without them.
 * Keep public/release.json in step with this list, and keep its version equal to APP_VERSION.
 */
export const RELEASE_NOTES = [
  "Swipe one print at a time. Right keeps it, left deletes it, and Soup opens the chemistry list.",
  "Keepsakes opens as two halves: Galleries, and Time Capsules.",
  "When the Feed has new frames, it opens on a swipe recap and then the new notes and reactions.",
  "A sample photo shows the Feed and the notes on the back of a frame, then that sample is gone.",
  "Feature Walkthrough in You starts the sample again, and so does making a profile.",
  "A photo can belong to more than one gallery. Adding it to another leaves the first one.",
  "The Feed does not show a gallery name on a frame.",
  "An emoji can be moved by the person who placed it, and by the one who shot the frame.",
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
