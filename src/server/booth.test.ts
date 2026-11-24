import assert from "node:assert/strict";
import test from "node:test";
import { BOOTH_LIMITS, boothRoom } from "./booth-line.ts";

test("new phones share one window", () => {
  assert.equal(boothRoom(0), true);
  assert.equal(boothRoom(BOOTH_LIMITS.newPerWindow - 1), true);
  assert.equal(boothRoom(BOOTH_LIMITS.newPerWindow), false);
  assert.equal(boothRoom(Number.NaN), false);
  assert.equal(boothRoom(-1), false);
});
