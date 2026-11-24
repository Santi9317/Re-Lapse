import assert from "node:assert/strict";
import test from "node:test";
import { isDoubleTap, shouldFlipOnDoubleTap, type TapPoint } from "./tap.ts";

const first: TapPoint = { x: 100, y: 200, at: 1_000 };

test("two close taps are a double tap", () => {
  assert.equal(isDoubleTap(first, { x: 110, y: 210, at: 1_200 }), true);
  assert.equal(isDoubleTap(null, { x: 110, y: 210, at: 1_200 }), false);
  assert.equal(isDoubleTap(first, { x: 110, y: 210, at: 1_400 }), false);
  assert.equal(isDoubleTap(first, { x: 180, y: 200, at: 1_200 }), false);
  assert.equal(isDoubleTap(first, { x: 100, y: 200, at: 1_000 }), false);
});

test("a pinch or a button is not a camera flip", () => {
  const next = { x: 104, y: 198, at: 1_180 };
  assert.equal(shouldFlipOnDoubleTap({ live: true, onControl: false, pinched: false, previous: first, next }), true);
  assert.equal(shouldFlipOnDoubleTap({ live: true, onControl: false, pinched: true, previous: first, next }), false);
  assert.equal(shouldFlipOnDoubleTap({ live: true, onControl: true, pinched: false, previous: first, next }), false);
  assert.equal(shouldFlipOnDoubleTap({ live: false, onControl: false, pinched: false, previous: first, next }), false);
  assert.equal(
    shouldFlipOnDoubleTap({ live: true, onControl: false, pinched: false, previous: first, next: { ...next, at: 2_000 } }),
    false,
  );
});
