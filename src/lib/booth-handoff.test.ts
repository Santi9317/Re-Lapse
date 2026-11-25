import assert from "node:assert/strict";
import test from "node:test";
import { BOOTH_HANDOFF, shouldReplayBooth } from "./booth-handoff.ts";

test("only the booth handoff is replayed", () => {
  assert.equal(shouldReplayBooth(409, BOOTH_HANDOFF), true);
  assert.equal(shouldReplayBooth(409, "This phone already asked."), false);
  assert.equal(shouldReplayBooth(429, BOOTH_HANDOFF), false);
  assert.equal(shouldReplayBooth(200, BOOTH_HANDOFF), false);
});
