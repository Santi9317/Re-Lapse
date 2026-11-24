import assert from "node:assert/strict";
import test from "node:test";
import { EXPOSURE_LINES, exposureLine, lapseQuip } from "./quips.ts";

test("a shot can land on different exposure lines", () => {
  assert.ok(EXPOSURE_LINES.length >= 48);
  assert.equal(new Set(EXPOSURE_LINES).size, EXPOSURE_LINES.length);
  const first = exposureLine(null, () => 0);
  const other = exposureLine(null, () => 0.5);
  assert.notEqual(first, other);
  assert.ok(EXPOSURE_LINES.includes(first));
  assert.ok(EXPOSURE_LINES.includes(other));
});

test("the next shot on this device skips the line it just showed", () => {
  for (const last of EXPOSURE_LINES) {
    for (let step = 0; step < 12; step++) {
      const line = exposureLine(last, () => step / 12);
      assert.notEqual(line, last);
      assert.ok(EXPOSURE_LINES.includes(line));
    }
  }
  const shown = exposureLine(null, () => 0);
  assert.notEqual(exposureLine(shown, () => 0), shown);
});

test("some lines are playfully vain", () => {
  const vain = EXPOSURE_LINES.filter((line) => /vain/i.test(line));
  assert.ok(vain.length >= 12);
});

test("exposure lines stay in the lab voice and off the develop clock", () => {
  for (const line of EXPOSURE_LINES) {
    assert.ok(line.trim().length > 0);
    assert.ok(line.length <= 48);
    assert.equal(line.includes("5 to 30"), false);
    assert.equal(/minute/i.test(line), false);
    assert.notEqual(line, "Exposed 📸");
  }
  assert.equal(lapseQuip("frame-7"), lapseQuip("frame-7"));
});
