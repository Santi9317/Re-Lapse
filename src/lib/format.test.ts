import assert from "node:assert/strict";
import test from "node:test";
import { dateTimeLocalMs, dateTimeLocalValue } from "./format.ts";

test("a local minute round-trips through the start field", () => {
  const local = new Date(2026, 10, 25, 15, 4, 0, 0);
  const value = dateTimeLocalValue(local.getTime());
  assert.equal(value, "2026-11-25T15:04");
  assert.equal(dateTimeLocalMs(value), local.getTime());
  assert.equal(dateTimeLocalValue(local.getTime() + 59_000), "2026-11-25T15:04");
  assert.equal(dateTimeLocalMs("2026-11-25T15:04:00"), null);
  assert.equal(dateTimeLocalMs("nope"), null);
});
