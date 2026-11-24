import assert from "node:assert/strict";
import test from "node:test";
import { JOIN_LIMITS, joinRoom, phoneMayJoin } from "./join-line.ts";

test("a phone fills its own join allowance, and that count is its own", () => {
  assert.equal(phoneMayJoin(0), true);
  assert.equal(phoneMayJoin(JOIN_LIMITS.perPhone - 1), true);
  assert.equal(phoneMayJoin(JOIN_LIMITS.perPhone), false);
  assert.equal(phoneMayJoin(Number.NaN), false);
});

test("a new browser shares the join line instead of opening another one", () => {
  assert.equal(joinRoom(0, 0), true);
  assert.equal(joinRoom(JOIN_LIMITS.pendingMax - 1, 0), true);
  assert.equal(joinRoom(JOIN_LIMITS.pendingMax, 0), false);
  assert.equal(joinRoom(0, JOIN_LIMITS.newPerWindow - 1), true);
  assert.equal(joinRoom(0, JOIN_LIMITS.newPerWindow), false);
  assert.equal(joinRoom(Number.NaN, 0), false);
});
