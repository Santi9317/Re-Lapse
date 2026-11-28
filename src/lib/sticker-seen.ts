import { readStorage, writeStorage } from "@/lib/shell";

/** Pins this camera has already had a chance to see, and the ones it has viewed. */
export const STICKER_SEEN_KEY = "relapse.stickerSeen";

export type StickerStamp = {
  photoId: string;
  stickerId: string;
  profileId: string;
  pinnedAt: number;
  mine: boolean;
};

type StickerBook = {
  /** Pins at this moment or earlier were already on the feed at the first look. */
  baseline: number;
  /** `photo:sticker` -> the pin moment this camera has viewed. */
  viewed: Record<string, number>;
};

function stickerKey(sticker: { photoId: string; stickerId: string }): string {
  return `${sticker.photoId}:${sticker.stickerId}`;
}

export function readStickerBook(raw: string | null): StickerBook | null {
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

function writeBook(storage: Storage, book: StickerBook) {
  writeStorage(storage, STICKER_SEEN_KEY, JSON.stringify({ baseline: book.baseline, viewed: book.viewed }));
}

/**
 * The first look records the newest pin already here, and later looks forget
 * pins that have left the feed. A pin after that first moment stays new
 * until this camera views that emoji.
 */
export function recallStickers(input: {
  storage: Storage;
  stickers: readonly StickerStamp[];
  now: number;
}): void {
  const current = readStickerBook(readStorage(input.storage, STICKER_SEEN_KEY));
  if (!current) {
    let newest = 0;
    for (const sticker of input.stickers) newest = Math.max(newest, Number.isFinite(sticker.pinnedAt) ? sticker.pinnedAt : 0);
    const now = Number.isFinite(input.now) && input.now > 0 ? input.now : 0;
    writeBook(input.storage, { baseline: Math.max(now, newest), viewed: {} });
    return;
  }
  const live = new Set(input.stickers.map((sticker) => stickerKey(sticker)));
  const viewed: Record<string, number> = {};
  let changed = false;
  for (const [key, at] of Object.entries(current.viewed)) {
    if (live.has(key)) viewed[key] = at;
    else changed = true;
  }
  if (changed) writeBook(input.storage, { baseline: current.baseline, viewed });
}

/** A pin this camera did not place, newer than the first look, and not viewed since. */
export function stickerUnseen(storage: Storage, sticker: StickerStamp): boolean {
  if (sticker.mine) return false;
  if (!sticker.photoId || !sticker.stickerId || !Number.isFinite(sticker.pinnedAt)) return false;
  const book = readStickerBook(readStorage(storage, STICKER_SEEN_KEY));
  if (!book || !(sticker.pinnedAt > book.baseline)) return false;
  const seenAt = book.viewed[stickerKey(sticker)];
  return !(seenAt != null && seenAt >= sticker.pinnedAt);
}

/** Remember that this emoji was on screen. Returns whether the book changed. */
export function noteStickerViewed(storage: Storage, sticker: StickerStamp): boolean {
  if (!sticker.photoId || !sticker.stickerId || !Number.isFinite(sticker.pinnedAt)) return false;
  const book = readStickerBook(readStorage(storage, STICKER_SEEN_KEY));
  if (!book) return false;
  const key = stickerKey(sticker);
  if (book.viewed[key] != null && book.viewed[key] >= sticker.pinnedAt) return false;
  book.viewed[key] = sticker.pinnedAt;
  writeBook(storage, book);
  return true;
}
