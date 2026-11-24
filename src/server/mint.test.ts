import assert from "node:assert/strict";
import test from "node:test";
import { MINT_LIMITS, mintRoom } from "./mint.ts";

test("a booth fills its own window, and the lab ceiling still bounds new ids", () => {
  assert.equal(mintRoom(0, 0), true);
  assert.equal(mintRoom(MINT_LIMITS.perBooth - 1, 0), true);
  assert.equal(mintRoom(MINT_LIMITS.perBooth, 0), false);
  assert.equal(mintRoom(0, MINT_LIMITS.global - 1), true);
  assert.equal(mintRoom(0, MINT_LIMITS.global), false);
  assert.equal(mintRoom(Number.NaN, 0), false);
});
