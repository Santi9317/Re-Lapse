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

test("a long swipe right sends it to the feed and a long swipe left keeps it off", () => {
  assert.equal(swipeVerdict(0), null);
  assert.equal(swipeVerdict(SWIPE_COMMIT_PX - 1), null);
  assert.equal(swipeVerdict(-(SWIPE_COMMIT_PX - 1)), null);
  assert.equal(swipeVerdict(SWIPE_COMMIT_PX), "feed");
  assert.equal(swipeVerdict(-SWIPE_COMMIT_PX), "pass");
  assert.equal(swipeVerdict(180), "feed");
  assert.equal(swipeVerdict(-180), "pass");
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
  const undo = { id: "pier", verdict: "pass" as const };
  assert.deepEqual(undoAfterTabChange(undo, "lab"), undo);
  assert.equal(undoAfterTabChange(undo, "feed"), null);
  assert.equal(undoAfterTabChange(undo, "shoot"), null);
  assert.equal(undoAfterTabChange(null, "lab"), null);
});

test("a swipe lifts the top print and undo puts that same print back", () => {
  const deck = [{ id: "pier" }, { id: "night" }, { id: "window" }];
  const kept = commitSwipe(deck, "feed");
  assert.ok(kept);
  assert.deepEqual(kept.deck.map((frame) => frame.id), ["night", "window"]);
  assert.deepEqual(kept.undo, { id: "pier", verdict: "feed" });
  assert.deepEqual(
    restoreSwipe(kept.deck, kept.frame, kept.undo).map((frame) => frame.id),
    ["pier", "night", "window"],
  );

  const passed = commitSwipe(deck, "pass");
  assert.ok(passed);
  assert.equal(passed.undo.verdict, "pass");
  assert.deepEqual(
    restoreSwipe(passed.deck, { id: "other" }, passed.undo).map((frame) => frame.id),
    ["night", "window"],
  );
  assert.equal(commitSwipe([], "feed"), null);
});

test("preview poses are the workshop stills", () => {
  assert.equal(labPose(null), null);
  assert.equal(labPose("live"), null);
  assert.equal(labPose("ready"), "ready");
  assert.equal(labPose("undo"), "undo");
  assert.equal(labPose("soup"), "soup");
  assert.equal(poseOffset("keep"), 156);
  assert.ok(poseOffset("keep") > SWIPE_COMMIT_PX);
  assert.equal(poseOffset("delete"), -156);
});

test("the lab home is one ready frame, and darkroom keeps the list", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../components/Lab.tsx", import.meta.url), "utf8");
  const deck = readFileSync(new URL("../components/LabDeck.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/preview/lab/page.tsx", import.meta.url), "utf8");
  assert.match(app, /LabDeck/);
  assert.doesNotMatch(app, /<Lab[\s>]/);
  assert.match(deck, /data-lab-view="select"/);
  assert.match(deck, /data-ready-count/);
  assert.match(deck, /data-develop-ready/);
  assert.match(deck, /data-lab-view="swipe"/);
  assert.match(deck, /data-skip-caption/);
  assert.match(deck, /data-undo-action/);
  assert.match(deck, /data-open-darkroom/);
  assert.match(deck, /data-close-darkroom/);
  assert.match(deck, /<Lab/);
  assert.match(deck, /Swipe right to send it to the feed/);
  assert.equal(deck.includes("Additional chemistry"), false);
  assert.equal(deck.includes("Send to the feed"), false);
  assert.equal(deck.includes("data-download"), false);
  assert.equal(deck.includes("data-open-soup"), false);
  assert.match(lab, /Additional chemistry/);
  assert.match(lab, /data-darkroom-title/);
  assert.match(lab, /data-develop=/);
  assert.match(lab, /data-lab-view=\{screen\}/);
  assert.match(page, /LabSwipePreview/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});
