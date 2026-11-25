import assert from "node:assert/strict";
import test from "node:test";
import { MINT_LIMITS, mintRoom } from "./mint.ts";

test("a phone fills its own window, and new phones share a short ceiling", () => {
  assert.ok(MINT_LIMITS.labWindow <= 12);
  assert.equal(mintRoom(0, 0), true);
  assert.equal(mintRoom(MINT_LIMITS.perPhone - 1, 0), true);
  assert.equal(mintRoom(MINT_LIMITS.perPhone, 0), false);
  assert.equal(mintRoom(0, MINT_LIMITS.labWindow - 1), true);
  assert.equal(mintRoom(0, MINT_LIMITS.labWindow), false);
  assert.equal(mintRoom(Number.NaN, 0), false);
  assert.equal(mintRoom(0, Number.NaN), false);
});
