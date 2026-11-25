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

/** Posts from other cameras newer than the last look. The first look has none. */
export function unseenFeedPosts(photos: readonly FeedStamp[], seenAt: number | null): number {
  if (seenAt == null) return 0;
  let count = 0;
  for (const photo of photos) {
    if (!photo.mine && photo.addedAt > seenAt) count += 1;
  }
  return count;
}

/**
 * Dot on Feed when someone else has added a frame since this camera last
 * caught up. Catching up is opening Feed and seeing the list. A frame this
 * camera took never lights the dot. The first check has no earlier open, so
 * frames already on the feed stay quiet. `count` is those unseen posts.
 */
export function feedTabMark(input: {
  photos: readonly FeedStamp[];
  seenAt: number | null;
  feedVisible: boolean;
  now: number;
}): { show: boolean; count: number; seenAt: number } {
  let newest = 0;
  for (const photo of input.photos) {
    if (photo.addedAt > newest) newest = photo.addedAt;
  }

  if (input.seenAt == null) {
    return { show: false, count: 0, seenAt: Math.max(input.now, newest) };
  }
  if (input.feedVisible) {
    return { show: false, count: 0, seenAt: Math.max(input.seenAt, newest) };
  }
  const count = unseenFeedPosts(input.photos, input.seenAt);
  return { show: count > 0, count, seenAt: input.seenAt };
}

/** Remember a look at the feed. `count` is unseen posts from other cameras. */
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
