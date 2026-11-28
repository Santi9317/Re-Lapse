import assert from "node:assert/strict";
import test from "node:test";
import { labScreenShows } from "./lab-screen.ts";

test("ready frames are the lab, and a new photo waits in the darkroom", () => {
  assert.equal(labScreenShows("ready", "select"), true);
  assert.equal(labScreenShows("developed", "select"), true);
  assert.equal(labScreenShows("developing", "select"), false);
  assert.equal(labScreenShows("sealed", "select"), false);
  assert.equal(labScreenShows("developing", "darkroom"), true);
  assert.equal(labScreenShows("sealed", "darkroom"), true);
  assert.equal(labScreenShows("ready", "darkroom"), false);
  assert.equal(labScreenShows("developed", "darkroom"), false);
});
