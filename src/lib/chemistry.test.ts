import assert from "node:assert/strict";
import test from "node:test";
import { developBath, heldChemistry, nextChemistry } from "./chemistry.ts";

test("tapping the chosen bath clears it, and neither choice develops as usual", () => {
  assert.equal(nextChemistry(null, "daylight"), "daylight");
  assert.equal(nextChemistry(null, "night"), "night");
  assert.equal(nextChemistry("default", "daylight"), "daylight");
  assert.equal(nextChemistry("night", "daylight"), "daylight");
  assert.equal(nextChemistry("daylight", "night"), "night");
  assert.equal(nextChemistry("daylight", "daylight"), null);
  assert.equal(nextChemistry("night", "night"), null);

  assert.equal(developBath(null), "default");
  assert.equal(developBath("default"), "default");
  assert.equal(developBath("daylight"), "daylight");
  assert.equal(developBath("night"), "night");
});

test("a pending clear stays cleared until the lab agrees", () => {
  const pending = new Map<string, "daylight" | "night" | null>([
    ["clear", null],
    ["day", "daylight"],
  ]);
  assert.equal(heldChemistry(pending, "clear", "daylight"), null);
  assert.equal(heldChemistry(pending, "day", null), "daylight");
  assert.equal(heldChemistry(pending, "other", "night"), "night");
  assert.equal(heldChemistry(pending, "other", null), null);
});
