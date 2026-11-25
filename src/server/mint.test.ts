import assert from "node:assert/strict";
import test from "node:test";
import { MINT_LIMITS, mintRoom } from "./mint.ts";

test("a phone fills its own window, and another phone still has room", () => {
  assert.equal(mintRoom(0), true);
  assert.equal(mintRoom(MINT_LIMITS.perPhone - 1), true);
  assert.equal(mintRoom(MINT_LIMITS.perPhone), false);
  assert.equal(mintRoom(Number.NaN), false);
});
