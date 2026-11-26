import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STICKER_SEEN_KEY,
  noteStickerViewed,
  readStickerBook,
  recallStickers,
  stickerUnseen,
  type StickerStamp,
} from "./sticker-seen.ts";

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

const pin = (profileId: string, pinnedAt: number, mine = false): StickerStamp => ({
  photoId: "photo",
  profileId,
  pinnedAt,
  mine,
});

test("a stored sticker book is a baseline and viewed pin moments", () => {
  assert.equal(readStickerBook(null), null);
  assert.equal(readStickerBook(""), null);
  assert.equal(readStickerBook("{"), null);
  assert.equal(readStickerBook("[]"), null);
  assert.equal(readStickerBook('{"baseline":-1,"viewed":{}}'), null);
  assert.deepEqual(readStickerBook('{"baseline":10,"viewed":{"p:a":12,"bad":"no"}}'), {
    baseline: 10,
    viewed: { "p:a": 12 },
  });
});

test("the first look leaves every current pin alone, and a later one is unseen until viewed", () => {
  const storage = memory();
  const early = pin("ada", 50);
  recallStickers({ storage, stickers: [early, pin("me", 80, true)], now: 100 });
  assert.equal(stickerUnseen(storage, early), false);
  assert.equal(stickerUnseen(storage, pin("me", 80, true)), false);
  assert.equal(readStickerBook(storage.getItem(STICKER_SEEN_KEY))?.baseline, 100);

  const fresh = pin("bea", 150);
  recallStickers({ storage, stickers: [early, fresh], now: 200 });
  assert.equal(readStickerBook(storage.getItem(STICKER_SEEN_KEY))?.baseline, 100);
  assert.equal(stickerUnseen(storage, fresh), true);
  assert.equal(stickerUnseen(storage, pin("me", 160, true)), false);
  assert.equal(stickerUnseen(storage, pin("bea", 100)), false);

  assert.equal(noteStickerViewed(storage, fresh), true);
  assert.equal(stickerUnseen(storage, fresh), false);
  assert.equal(noteStickerViewed(storage, fresh), false);

  const other = pin("cam", 170);
  assert.equal(stickerUnseen(storage, other), true);
  const changed = pin("bea", 180);
  assert.equal(stickerUnseen(storage, changed), true);
  assert.equal(noteStickerViewed(storage, changed), true);
  assert.equal(stickerUnseen(storage, changed), false);
  assert.equal(stickerUnseen(storage, other), true);
});

test("a view before the first look does not invent a book", () => {
  const storage = memory();
  assert.equal(noteStickerViewed(storage, pin("ada", 20)), false);
  assert.equal(storage.getItem(STICKER_SEEN_KEY), null);
  assert.equal(stickerUnseen(storage, pin("ada", 20)), false);
});

test("a pin that has left the feed is forgotten", () => {
  const storage = memory();
  recallStickers({ storage, stickers: [], now: 100 });
  const stuck = pin("ada", 150);
  assert.equal(noteStickerViewed(storage, stuck), true);
  recallStickers({ storage, stickers: [stuck], now: 180 });
  assert.equal(stickerUnseen(storage, stuck), false);
  recallStickers({ storage, stickers: [], now: 190 });
  assert.equal(stickerUnseen(storage, stuck), true);
});

test("a broken book is replaced by the next look", () => {
  const storage = memory();
  storage.setItem(STICKER_SEEN_KEY, "nope");
  recallStickers({ storage, stickers: [pin("ada", 40)], now: 50 });
  assert.equal(stickerUnseen(storage, pin("ada", 40)), false);
  assert.equal(stickerUnseen(storage, pin("bea", 60)), true);
});

test("an unseen pin keeps the sticker edge until it has been on screen", () => {
  const print = readFileSync(new URL("../components/Print.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(print, /data-unseen=\{fresh \? "true" : undefined\}/);
  assert.match(print, /shown=\{!turned\}/);
  assert.match(print, /noteStickerViewed/);
  assert.match(print, /IntersectionObserver/);
  assert.match(print, /intersectionRatio >= 0\.5/);
  assert.match(print, /!entry\.isIntersecting && onScreen\.current\.has\(profileId\)/);
  assert.match(print, /item\.onFeed/);
  const unseenRule = css.match(/\.sticker\[data-unseen="true"\]\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(unseenRule, /0 0 0 3px var\(--signal\)/);
  assert.equal(unseenRule.includes("26, 16, 40"), false);
  assert.equal(css.includes("sticker-badge"), false);
  assert.equal(print.includes("Keepsakes"), false);
});
