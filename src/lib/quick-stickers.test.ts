import assert from "node:assert/strict";
import test from "node:test";
import { QUICK_STICKER_COUNT, pickQuickStickers } from "./quick-stickers.ts";

function pool(size: number): string[] {
  return Array.from({ length: size }, (_, index) => `e${index}`);
}

function zero(): number {
  return 0;
}

test("a draw is seven unique emojis from the pool", () => {
  const source = pool(20);
  const picked = pickQuickStickers(source, [], zero);
  assert.equal(picked.length, QUICK_STICKER_COUNT);
  assert.equal(new Set(picked).size, QUICK_STICKER_COUNT);
  for (const emoji of picked) assert.equal(source.includes(emoji), true);
  assert.deepEqual(picked, ["e0", "e1", "e2", "e3", "e4", "e5", "e6"]);
  assert.deepEqual(source, pool(20));
});

test("the next double tap does not reuse the previous set", () => {
  const source = pool(20);
  const first = pickQuickStickers(source, [], zero);
  const second = pickQuickStickers(source, first, zero);
  assert.equal(second.length, QUICK_STICKER_COUNT);
  assert.equal(new Set(second).size, QUICK_STICKER_COUNT);
  for (const emoji of second) assert.equal(first.includes(emoji), false);
  assert.equal(
    first.every((emoji) => second.includes(emoji)),
    false,
  );
  const third = pickQuickStickers(source, second, () => 0.999);
  for (const emoji of third) assert.equal(second.includes(emoji), false);
});

test("a set is still new when the pool cannot spare seven fresh emojis", () => {
  const source = pool(8);
  const previous = ["e0", "e1", "e2", "e3", "e4", "e5", "e6"];
  const picked = pickQuickStickers(source, previous, zero);
  assert.equal(picked.length, QUICK_STICKER_COUNT);
  assert.equal(new Set(picked).size, QUICK_STICKER_COUNT);
  assert.equal(picked.includes("e7"), true);
  assert.equal(
    previous.every((emoji) => picked.includes(emoji)),
    false,
  );
});

test("the only possible set is returned when nothing else exists", () => {
  const source = ["a", "b", "c"];
  assert.deepEqual(pickQuickStickers(source, ["c", "b", "a"], zero, 3), ["a", "b", "c"]);
  assert.deepEqual(pickQuickStickers([], ["a"], zero), []);
  assert.deepEqual(pickQuickStickers(["a", "a", ""], [], zero, 7), ["a"]);
});
