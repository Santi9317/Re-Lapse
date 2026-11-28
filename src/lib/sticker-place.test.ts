import assert from "node:assert/strict";
import test from "node:test";
import { clampStickerPoint, nextStickerSpot, readStickerSpot, stickerSpot, stickerTilt } from "./sticker-place.ts";

test("a sticker keeps an edge spot and a small tilt", () => {
  assert.deepEqual(stickerSpot(0), { x: 12, y: 10 });
  assert.deepEqual(stickerSpot(1), { x: 88, y: 10 });
  assert.equal(stickerTilt(0), -6);
  assert.equal(stickerTilt(1), 8);
  assert.deepEqual(readStickerSpot(null, null, 1), stickerSpot(1));
  assert.deepEqual(readStickerSpot("40", "60", 0), { x: 40, y: 60 });
});

test("the next sticker takes an open edge, and a drag stays on the photo", () => {
  assert.deepEqual(nextStickerSpot([]), stickerSpot(0));
  assert.deepEqual(nextStickerSpot([stickerSpot(0)]), stickerSpot(1));
  const crowded = Array.from({ length: 24 }, (_, index) => stickerSpot(index));
  assert.deepEqual(nextStickerSpot(crowded), stickerSpot(24));
  assert.deepEqual(clampStickerPoint(-4, 140), { x: 8, y: 92 });
  assert.deepEqual(clampStickerPoint(40.04, 60.06), { x: 40, y: 60.1 });
});
