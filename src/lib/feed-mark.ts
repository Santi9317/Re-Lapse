import { readStorage, writeStorage } from "@/lib/shell";

/** Newest feed moment this camera has already seen. */
export const FEED_SEEN_KEY = "relapse.feedSeen";

export type FeedStamp = {
  mine: boolean;
  /** When the frame landed on the feed. */
  addedAt: number;
};

export function readFeedSeen(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const seen = Number(raw);
  if (!Number.isFinite(seen) || seen < 0) return null;
  return seen;
}

/**
 * Dot on Feed when someone else has added a frame since this camera last
 * caught up. Catching up is opening Feed and seeing the list. A frame this
 * camera took never lights the dot. The first check has no earlier open, so
 * frames already on the feed stay quiet.
 */
export function feedTabMark(input: {
  photos: readonly FeedStamp[];
  seenAt: number | null;
  feedVisible: boolean;
  now: number;
}): { show: boolean; seenAt: number } {
  let newest = 0;
  let newestOther = 0;
  for (const photo of input.photos) {
    if (photo.addedAt > newest) newest = photo.addedAt;
    if (!photo.mine && photo.addedAt > newestOther) newestOther = photo.addedAt;
  }

  if (input.seenAt == null) {
    return { show: false, seenAt: Math.max(input.now, newest) };
  }
  if (input.feedVisible) {
    return { show: false, seenAt: Math.max(input.seenAt, newest) };
  }
  return { show: newestOther > input.seenAt, seenAt: input.seenAt };
}

/** Remember a look at the feed, and say whether the Feed tab should show its dot. */
export function noteFeedLook(input: {
  storage: Storage;
  photos: readonly FeedStamp[];
  feedVisible: boolean;
  now: number;
}): boolean {
  const seenAt = readFeedSeen(readStorage(input.storage, FEED_SEEN_KEY));
  const next = feedTabMark({
    photos: input.photos,
    seenAt,
    feedVisible: input.feedVisible,
    now: input.now,
  });
  if (next.seenAt !== seenAt) writeStorage(input.storage, FEED_SEEN_KEY, String(next.seenAt));
  return next.show;
}
