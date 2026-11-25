/**
 * What this publish says is new. Write these for someone using the camera.
 * One short line each. Do not invent lines for publishes that shipped without them.
 * Keep public/release.json in step with this list, and keep its version equal to APP_VERSION.
 */
export const RELEASE_NOTES = [
  "Save the shortcut to the Home Screen again so the new icon appears.",
  "Your home screen icon changes to the wink.",
  "The gate icon stays the shutter.",
  "A mark on Feed when someone else adds a photo.",
  "A gallery on a profile shows only the photos in it.",
  "Feed names sit a little larger, with the emojis tucked together, and download and delete match the other buttons.",
  "The date stamp switch now matches the rest of the camera.",
  "Choosing photos slides sideways, so the buttons below stay close.",
  "New photos and other changes show up when you switch tabs.",
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
