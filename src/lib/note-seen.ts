import { readStorage, writeStorage } from "@/lib/shell";

/** Notes this camera has already had a chance to see, and the ones it has opened. */
export const NOTE_SEEN_KEY = "relapse.noteSeen";

export type NoteStamp = {
  photoId: string;
  noteId: string;
  createdAt: number;
  mine: boolean;
};

type NoteBook = {
  /** Notes at this moment or earlier were already on the feed at the first look. */
  baseline: number;
  /** `photo:note` -> the sign moment this camera has opened. */
  viewed: Record<string, number>;
};

function noteKey(note: { photoId: string; noteId: string }): string {
  return `${note.photoId}:${note.noteId}`;
}

export function readNoteBook(raw: string | null): NoteBook | null {
  if (raw == null || raw.trim() === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const baseline = (parsed as { baseline?: unknown }).baseline;
  if (typeof baseline !== "number" || !Number.isFinite(baseline) || baseline < 0) return null;
  const viewedRaw = (parsed as { viewed?: unknown }).viewed;
  const viewed: Record<string, number> = {};
  if (viewedRaw && typeof viewedRaw === "object") {
    for (const [key, value] of Object.entries(viewedRaw)) {
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) viewed[key] = value;
    }
  }
  return { baseline, viewed };
}

function writeBook(storage: Storage, book: NoteBook) {
  writeStorage(storage, NOTE_SEEN_KEY, JSON.stringify({ baseline: book.baseline, viewed: book.viewed }));
}

/**
 * The first look records the newest note already here, and later looks forget
 * notes that have left the feed. A note after that first moment stays new
 * until this camera opens the back.
 */
export function recallNotes(input: {
  storage: Storage;
  notes: readonly NoteStamp[];
  now: number;
}): void {
  const current = readNoteBook(readStorage(input.storage, NOTE_SEEN_KEY));
  if (!current) {
    let newest = 0;
    for (const note of input.notes) newest = Math.max(newest, Number.isFinite(note.createdAt) ? note.createdAt : 0);
    const now = Number.isFinite(input.now) && input.now > 0 ? input.now : 0;
    writeBook(input.storage, { baseline: Math.max(now, newest), viewed: {} });
    return;
  }
  const live = new Set(input.notes.map((note) => noteKey(note)));
  const viewed: Record<string, number> = {};
  let changed = false;
  for (const [key, at] of Object.entries(current.viewed)) {
    if (live.has(key)) viewed[key] = at;
    else changed = true;
  }
  if (changed) writeBook(input.storage, { baseline: current.baseline, viewed });
}

/** A note this camera did not write, newer than the first look, and not opened since. */
export function noteUnseen(storage: Storage, note: NoteStamp): boolean {
  if (note.mine) return false;
  if (!note.photoId || !note.noteId || !Number.isFinite(note.createdAt)) return false;
  const book = readNoteBook(readStorage(storage, NOTE_SEEN_KEY));
  if (!book || !(note.createdAt > book.baseline)) return false;
  const seenAt = book.viewed[noteKey(note)];
  return !(seenAt != null && seenAt >= note.createdAt);
}

/** The frame outline is on when any note on it is still unseen. */
export function frameHasUnseenNote(storage: Storage, notes: readonly NoteStamp[]): boolean {
  return notes.some((note) => noteUnseen(storage, note));
}

/**
 * Opening the back marks every note already on it.
 * Scrolling past the front does not call this. Returns whether the book changed.
 */
export function noteNotesViewed(storage: Storage, notes: readonly NoteStamp[]): boolean {
  const book = readNoteBook(readStorage(storage, NOTE_SEEN_KEY));
  if (!book) return false;
  let changed = false;
  for (const note of notes) {
    if (!note.photoId || !note.noteId || !Number.isFinite(note.createdAt)) continue;
    const key = noteKey(note);
    if (book.viewed[key] != null && book.viewed[key] >= note.createdAt) continue;
    book.viewed[key] = note.createdAt;
    changed = true;
  }
  if (changed) writeBook(storage, book);
  return changed;
}
