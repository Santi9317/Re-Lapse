import assert from "node:assert/strict";
import test from "node:test";
import { MINT_LIMITS, mintRoom } from "./mint.ts";

test("one booth fills its own window before the lab ceiling", () => {
  assert.equal(mintRoom(0, 0), true);
  assert.equal(mintRoom(MINT_LIMITS.perBooth - 1, 0), true);
  assert.equal(mintRoom(MINT_LIMITS.perBooth, 0), false);
  assert.equal(mintRoom(0, MINT_LIMITS.global - 1), true);
  assert.equal(mintRoom(0, MINT_LIMITS.global), false);
  assert.equal(mintRoom(1, MINT_LIMITS.global), false);
  assert.equal(MINT_LIMITS.perBooth < MINT_LIMITS.global, true);
});
