import { readStorage, writeStorage } from "@/lib/shell";

/** Newest feed moment this camera has already checked. */
export const FEED_SEEN_KEY = "relapse.feedSeen";

/** A note or a pin on a frame. `at` is when it was signed or last pinned. */
export type FeedMoment = {
  mine: boolean;
  at: number;
};

export type FeedStamp = {
  mine: boolean;
  /** When the frame landed on the feed. */
  addedAt: number;
  notes?: readonly FeedMoment[];
  pins?: readonly FeedMoment[];
};

function later(current: number, at: number): number {
  return Number.isFinite(at) && at > current ? at : current;
}

export function readFeedSeen(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const seen = Number(raw);
  if (!Number.isFinite(seen) || seen < 0) return null;
  return seen;
}

/**
 * Activity newer than the last check.
 * A frame this camera took does not count. A note or pin this camera wrote
 * does not count either, including on its own frames. Someone else's note or
 * pin does, on any frame in the list.
 */
export function unseenFeedPosts(photos: readonly FeedStamp[], seenAt: number | null): number {
  if (seenAt == null) return 0;
  let count = 0;
  for (const photo of photos) {
    if (!photo.mine && photo.addedAt > seenAt) count += 1;
    for (const note of photo.notes ?? []) {
      if (!note.mine && note.at > seenAt) count += 1;
    }
    for (const pin of photo.pins ?? []) {
      if (!pin.mine && pin.at > seenAt) count += 1;
    }
  }
  return count;
}

function newestActivity(photos: readonly FeedStamp[]): number {
  let newest = 0;
  for (const photo of photos) {
    newest = later(newest, photo.addedAt);
    for (const note of photo.notes ?? []) newest = later(newest, note.at);
    for (const pin of photo.pins ?? []) newest = later(newest, pin.at);
  }
  return newest;
}

/**
 * Dot on Feed when something new has landed since this camera last checked.
 * Checked means the Feed list is open: that look catches up every frame,
 * note, and pin already in the list. The dot stays off while Feed is open.
 * It comes back on another tab only when something newer appears: a frame
 * someone else posted, a note this camera did not write, or a pin this
 * camera did not place. The first check has no earlier open, so what is
 * already on the feed stays quiet. `count` is those unseen items.
 */
export function feedTabMark(input: {
  photos: readonly FeedStamp[];
  seenAt: number | null;
  feedVisible: boolean;
  now: number;
}): { show: boolean; count: number; seenAt: number } {
  const newest = newestActivity(input.photos);

  if (input.seenAt == null) {
    return { show: false, count: 0, seenAt: Math.max(input.now, newest) };
  }
  if (input.feedVisible) {
    return { show: false, count: 0, seenAt: Math.max(input.seenAt, newest) };
  }
  const count = unseenFeedPosts(input.photos, input.seenAt);
  return { show: count > 0, count, seenAt: input.seenAt };
}

/** Remember a check of the feed. `count` is unseen photos, notes, and pins. */
export function noteFeedLook(input: {
  storage: Storage;
  photos: readonly FeedStamp[];
  feedVisible: boolean;
  now: number;
}): { show: boolean; count: number } {
  const seenAt = readFeedSeen(readStorage(input.storage, FEED_SEEN_KEY));
  const next = feedTabMark({
    photos: input.photos,
    seenAt,
    feedVisible: input.feedVisible,
    now: input.now,
  });
  if (next.seenAt !== seenAt) writeStorage(input.storage, FEED_SEEN_KEY, String(next.seenAt));
  return { show: next.show, count: next.count };
}
