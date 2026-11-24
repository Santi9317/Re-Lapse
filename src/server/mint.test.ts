import assert from "node:assert/strict";
import test from "node:test";
import { MINT_LIMITS, mintRoom } from "./mint.ts";

test("one booth fills only its own window", () => {
  assert.equal(mintRoom(0), true);
  assert.equal(mintRoom(MINT_LIMITS.perBooth - 1), true);
  assert.equal(mintRoom(MINT_LIMITS.perBooth), false);
  assert.equal(mintRoom(Number.NaN), false);
  assert.equal(mintRoom(-1), false);
});
