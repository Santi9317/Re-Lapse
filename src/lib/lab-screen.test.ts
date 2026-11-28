import assert from "node:assert/strict";
import test from "node:test";
import { labScreenShows, readyLabel } from "./lab-screen.ts";

test("the lab home is not a card list, and darkroom keeps every frame", () => {
  for (const state of ["ready", "developed", "developing", "sealed"] as const) {
    assert.equal(labScreenShows(state, "select"), false);
    assert.equal(labScreenShows(state, "darkroom"), true);
  }
});

test("the ready line counts photos waiting to develop", () => {
  assert.equal(readyLabel(0), "0 ready");
  assert.equal(readyLabel(1), "1 ready");
  assert.equal(readyLabel(3), "3 ready");
  assert.equal(readyLabel(3.8), "3 ready");
  assert.equal(readyLabel(-2), "0 ready");
});
