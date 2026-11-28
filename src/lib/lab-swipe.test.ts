import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  SWIPE_COMMIT_PX,
  commitSwipe,
  developingLabel,
  labPose,
  poseOffset,
  restoreSwipe,
  swipeTilt,
  swipeVerdict,
  undoAfterTabChange,
} from "./lab-swipe.ts";

test("a long swipe right keeps and a long swipe left deletes", () => {
  assert.equal(swipeVerdict(0), null);
  assert.equal(swipeVerdict(SWIPE_COMMIT_PX - 1), null);
  assert.equal(swipeVerdict(-(SWIPE_COMMIT_PX - 1)), null);
  assert.equal(swipeVerdict(SWIPE_COMMIT_PX), "keep");
  assert.equal(swipeVerdict(-SWIPE_COMMIT_PX), "delete");
  assert.equal(swipeVerdict(180), "keep");
  assert.equal(swipeVerdict(-180), "delete");
});

test("the print tilts with the drag and stays in a small range", () => {
  assert.equal(swipeTilt(0, 360), 0);
  assert.equal(swipeTilt(100, 0), 0);
  assert.ok(swipeTilt(156, 360) > 0);
  assert.ok(swipeTilt(-156, 360) < 0);
  assert.equal(swipeTilt(800, 200), 14);
  assert.equal(swipeTilt(-800, 200), -14);
});

test("the developing line counts frames still in the soup", () => {
  assert.equal(developingLabel(0), "0 developing");
  assert.equal(developingLabel(1), "1 developing");
  assert.equal(developingLabel(3), "3 developing");
  assert.equal(developingLabel(3.8), "3 developing");
  assert.equal(developingLabel(-2), "0 developing");
});

test("undo lasts only while the lab tab is the one open", () => {
  const undo = { id: "pier", verdict: "delete" as const };
  assert.deepEqual(undoAfterTabChange(undo, "lab"), undo);
  assert.equal(undoAfterTabChange(undo, "feed"), null);
  assert.equal(undoAfterTabChange(undo, "shoot"), null);
  assert.equal(undoAfterTabChange(null, "lab"), null);
});

test("a swipe lifts the top print and undo puts that same print back", () => {
  const deck = [{ id: "pier" }, { id: "night" }, { id: "window" }];
  const kept = commitSwipe(deck, "keep");
  assert.ok(kept);
  assert.deepEqual(kept.deck.map((frame) => frame.id), ["night", "window"]);
  assert.deepEqual(kept.undo, { id: "pier", verdict: "keep" });
  assert.deepEqual(
    restoreSwipe(kept.deck, kept.frame, kept.undo).map((frame) => frame.id),
    ["pier", "night", "window"],
  );

  const deleted = commitSwipe(deck, "delete");
  assert.ok(deleted);
  assert.equal(deleted.undo.verdict, "delete");
  assert.deepEqual(
    restoreSwipe(deleted.deck, { id: "other" }, deleted.undo).map((frame) => frame.id),
    ["night", "window"],
  );
  assert.equal(commitSwipe([], "keep"), null);
});

test("preview poses are the workshop stills", () => {
  assert.equal(labPose(null), null);
  assert.equal(labPose("live"), null);
  assert.equal(labPose("ready"), "ready");
  assert.equal(labPose("undo"), "undo");
  assert.equal(poseOffset("keep"), 156);
  assert.ok(poseOffset("keep") > SWIPE_COMMIT_PX);
  assert.equal(poseOffset("delete"), -156);
});

test("the swipe preview is not wired into the live lab", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../components/Lab.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/preview/lab/page.tsx", import.meta.url), "utf8");
  assert.match(app, /from "@\/components\/Lab"/);
  assert.doesNotMatch(app, /LabSwipe/);
  assert.doesNotMatch(lab, /lab-swipe/);
  assert.match(page, /LabSwipePreview/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});
