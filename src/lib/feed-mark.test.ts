import assert from "node:assert/strict";
import test from "node:test";
import { FEED_SEEN_KEY, feedTabMark, noteFeedLook, readFeedSeen } from "./feed-mark.ts";

const other = (addedAt: number) => ({ mine: false, addedAt });
const own = (addedAt: number) => ({ mine: true, addedAt });

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("a stored feed cursor is a finite time", () => {
  assert.equal(readFeedSeen(null), null);
  assert.equal(readFeedSeen(""), null);
  assert.equal(readFeedSeen("nope"), null);
  assert.equal(readFeedSeen("-1"), null);
  assert.equal(readFeedSeen("12.5"), 12.5);
});

test("the first check stays quiet, then someone else's frame lights the dot", () => {
  const opened = feedTabMark({
    photos: [other(50), own(80)],
    seenAt: null,
    feedVisible: false,
    now: 100,
  });
  assert.equal(opened.show, false);
  assert.equal(opened.seenAt, 100);

  const quiet = feedTabMark({
    photos: [other(50), own(120)],
    seenAt: opened.seenAt,
    feedVisible: false,
    now: 130,
  });
  assert.equal(quiet.show, false);
  assert.equal(quiet.seenAt, 100);

  const fresh = feedTabMark({
    photos: [other(50), own(120), other(140)],
    seenAt: quiet.seenAt,
    feedVisible: false,
    now: 150,
  });
  assert.equal(fresh.show, true);
  assert.equal(fresh.seenAt, 100);
});

test("opening the feed clears the dot, and a later frame from this camera does not bring it back", () => {
  const seen = feedTabMark({
    photos: [other(140), own(120)],
    seenAt: 100,
    feedVisible: true,
    now: 150,
  });
  assert.equal(seen.show, false);
  assert.equal(seen.seenAt, 140);

  const ownLater = feedTabMark({
    photos: [other(140), own(180)],
    seenAt: seen.seenAt,
    feedVisible: false,
    now: 190,
  });
  assert.equal(ownLater.show, false);
  assert.equal(ownLater.seenAt, 140);

  const otherLater = feedTabMark({
    photos: [other(200), own(180)],
    seenAt: ownLater.seenAt,
    feedVisible: false,
    now: 210,
  });
  assert.equal(otherLater.show, true);

  const caughtUp = feedTabMark({
    photos: [other(200), own(180)],
    seenAt: otherLater.seenAt,
    feedVisible: true,
    now: 210,
  });
  assert.equal(caughtUp.show, false);
  assert.equal(caughtUp.seenAt, 200);
});

test("a frame at the same moment as the last look is already seen", () => {
  const same = feedTabMark({
    photos: [other(140)],
    seenAt: 140,
    feedVisible: false,
    now: 150,
  });
  assert.equal(same.show, false);
});

test("the dot is remembered on this camera until the feed is opened", () => {
  const storage = memory();
  const now = 1_000;
  assert.equal(
    noteFeedLook({ storage, photos: [other(400), own(700)], feedVisible: false, now }),
    false,
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1000");

  assert.equal(
    noteFeedLook({ storage, photos: [other(400), own(1_100)], feedVisible: false, now: 1_200 }),
    false,
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1000");

  assert.equal(
    noteFeedLook({ storage, photos: [other(1_300), own(1_100)], feedVisible: false, now: 1_400 }),
    true,
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1000");

  assert.equal(
    noteFeedLook({ storage, photos: [other(1_300), own(1_100)], feedVisible: true, now: 1_400 }),
    false,
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1300");

  assert.equal(
    noteFeedLook({ storage, photos: [other(1_300), own(1_500)], feedVisible: false, now: 1_600 }),
    false,
  );
});
