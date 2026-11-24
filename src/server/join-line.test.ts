import assert from "node:assert/strict";
import test from "node:test";
import { JOIN_LIMITS, joinRoom } from "./join-line.ts";

test("the join line closes when it is full or moving too fast", () => {
  assert.equal(joinRoom(0, 0), true);
  assert.equal(joinRoom(JOIN_LIMITS.pendingMax - 1, 0), true);
  assert.equal(joinRoom(JOIN_LIMITS.pendingMax, 0), false);
  assert.equal(joinRoom(0, JOIN_LIMITS.newPerWindow - 1), true);
  assert.equal(joinRoom(0, JOIN_LIMITS.newPerWindow), false);
  assert.equal(joinRoom(Number.NaN, 0), false);
});
