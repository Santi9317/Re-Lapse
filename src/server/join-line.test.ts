import assert from "node:assert/strict";
import test from "node:test";
import { JOIN_LIMITS, phoneMayJoin } from "./join-line.ts";

test("a phone fills its own join allowance, and that count is its own", () => {
  assert.equal(phoneMayJoin(0), true);
  assert.equal(phoneMayJoin(JOIN_LIMITS.perPhone - 1), true);
  assert.equal(phoneMayJoin(JOIN_LIMITS.perPhone), false);
  assert.equal(phoneMayJoin(Number.NaN), false);
});
