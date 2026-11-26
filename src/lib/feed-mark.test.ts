import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FEED_SEEN_KEY, feedTabMark, noteFeedLook, readFeedSeen } from "./feed-mark.ts";

const other = (addedAt: number) => ({ mine: false, addedAt });
const own = (addedAt: number) => ({ mine: true, addedAt });
const note = (at: number, mine = false) => ({ mine, at });
const pin = (at: number, mine = false) => ({ mine, at });

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
  assert.equal(opened.count, 0);
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
  assert.equal(fresh.count, 1);
  assert.equal(fresh.seenAt, 100);

  const two = feedTabMark({
    photos: [other(140), other(160), own(120)],
    seenAt: quiet.seenAt,
    feedVisible: false,
    now: 170,
  });
  assert.equal(two.show, true);
  assert.equal(two.count, 2);
});

test("opening the feed clears the dot, and a later frame from this camera does not bring it back", () => {
  const seen = feedTabMark({
    photos: [other(140), own(120)],
    seenAt: 100,
    feedVisible: true,
    now: 150,
  });
  assert.equal(seen.show, false);
  assert.equal(seen.count, 0);
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
  assert.equal(otherLater.count, 1);

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
  assert.equal(same.count, 0);
});

test("the dot is remembered on this camera until the feed is opened", () => {
  const storage = memory();
  const now = 1_000;
  assert.deepEqual(
    noteFeedLook({ storage, photos: [other(400), own(700)], feedVisible: false, now }),
    { show: false, count: 0 },
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1000");

  assert.deepEqual(
    noteFeedLook({ storage, photos: [other(400), own(1_100)], feedVisible: false, now: 1_200 }),
    { show: false, count: 0 },
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1000");

  assert.deepEqual(
    noteFeedLook({ storage, photos: [other(1_300), own(1_100)], feedVisible: false, now: 1_400 }),
    { show: true, count: 1 },
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1000");

  assert.deepEqual(
    noteFeedLook({ storage, photos: [other(1_300), other(1_500), own(1_100)], feedVisible: false, now: 1_600 }),
    { show: true, count: 2 },
  );

  assert.deepEqual(
    noteFeedLook({ storage, photos: [other(1_300), other(1_500), own(1_100)], feedVisible: true, now: 1_600 }),
    { show: false, count: 0 },
  );
  assert.equal(storage.getItem(FEED_SEEN_KEY), "1500");

  assert.deepEqual(
    noteFeedLook({ storage, photos: [other(1_300), other(1_500), own(1_700)], feedVisible: false, now: 1_800 }),
    { show: false, count: 0 },
  );
});

test("the first check stays quiet for notes and pins already on the feed", () => {
  const opened = feedTabMark({
    photos: [{ mine: true, addedAt: 40, notes: [note(90)], pins: [pin(110)] }],
    seenAt: null,
    feedVisible: false,
    now: 80,
  });
  assert.equal(opened.show, false);
  assert.equal(opened.count, 0);
  assert.equal(opened.seenAt, 110);
});

test("a note or pin on your own photo lights the dot, and one you wrote does not", () => {
  const fresh = feedTabMark({
    photos: [
      {
        mine: true,
        addedAt: 50,
        notes: [note(80, true), note(90)],
        pins: [pin(70, true), pin(95)],
      },
      { mine: false, addedAt: 30, notes: [note(92)], pins: [] },
    ],
    seenAt: 60,
    feedVisible: false,
    now: 100,
  });
  assert.equal(fresh.show, true);
  assert.equal(fresh.count, 3);
  assert.equal(fresh.seenAt, 60);

  const ownOnly = feedTabMark({
    photos: [{ mine: true, addedAt: 50, notes: [note(80, true)], pins: [pin(95, true)] }],
    seenAt: 60,
    feedVisible: false,
    now: 100,
  });
  assert.equal(ownOnly.show, false);
  assert.equal(ownOnly.count, 0);
});

test("opening the feed checks notes and pins, and only a newer one brings the dot back", () => {
  const seen = feedTabMark({
    photos: [{ mine: true, addedAt: 40, notes: [note(120)], pins: [pin(130)] }, other(50)],
    seenAt: 100,
    feedVisible: true,
    now: 140,
  });
  assert.equal(seen.show, false);
  assert.equal(seen.count, 0);
  assert.equal(seen.seenAt, 130);

  const same = feedTabMark({
    photos: [{ mine: true, addedAt: 40, notes: [note(120)], pins: [pin(130)] }],
    seenAt: seen.seenAt,
    feedVisible: false,
    now: 150,
  });
  assert.equal(same.show, false);
  assert.equal(same.count, 0);

  const later = feedTabMark({
    photos: [{ mine: false, addedAt: 40, notes: [note(120), note(160)], pins: [pin(130)] }],
    seenAt: seen.seenAt,
    feedVisible: false,
    now: 170,
  });
  assert.equal(later.show, true);
  assert.equal(later.count, 1);
  assert.equal(later.seenAt, 130);

  const caughtUp = feedTabMark({
    photos: [{ mine: true, addedAt: 40, notes: [note(160)], pins: [pin(130, true)] }],
    seenAt: later.seenAt,
    feedVisible: true,
    now: 170,
  });
  assert.equal(caughtUp.show, false);
  assert.equal(caughtUp.seenAt, 160);
});

test("a note at the same moment as the last check is already seen", () => {
  const same = feedTabMark({
    photos: [{ mine: true, addedAt: 10, notes: [note(140)], pins: [pin(140)] }],
    seenAt: 140,
    feedVisible: false,
    now: 150,
  });
  assert.equal(same.show, false);
  assert.equal(same.count, 0);
});

test("the dot counts a new photo, a new note, and a new pin together", () => {
  const fresh = feedTabMark({
    photos: [
      other(150),
      {
        mine: true,
        addedAt: 40,
        notes: [note(160), note(140, true)],
        pins: [pin(170), pin(180, true)],
      },
    ],
    seenAt: 100,
    feedVisible: false,
    now: 200,
  });
  assert.equal(fresh.show, true);
  assert.equal(fresh.count, 3);
});

test("the feed dot is the same mark, and Keepsakes stays plain", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  assert.match(app, /function catchFeed/);
  assert.match(app, /recallNotes/);
  assert.match(app, /notes: photo\.comments\.map/);
  assert.match(app, /pins: photo\.stickers\.map/);
  assert.match(app, /catchFeed\(data\.photos, false\)/);
  assert.match(app, /catchFeed\(photos, true\)/);
  assert.match(app, /aria-label="New on the feed"/);
  assert.equal((app.match(/className="dot"/g) ?? []).length, 2);
  assert.equal(app.includes('id === "rolls"'), false);
  assert.equal(app.includes('className="banner"'), false);
});
