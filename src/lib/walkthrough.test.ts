import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FEATURE_WALK, FEATURE_WALK_KEY, featureWalkDue, featureWalkSeen } from "./walkthrough.ts";

test("the walk is the feed, a frame, and the notes on the back", () => {
  assert.deepEqual(
    FEATURE_WALK.map((step) => step.id),
    ["feed", "frame", "notes"],
  );
  const lines = FEATURE_WALK.map((step) => step.line).join(" ");
  const titles = FEATURE_WALK.map((step) => step.title).join(" ");
  assert.match(titles, /The Feed/);
  assert.equal(titles.includes("Frames from this link"), false);
  assert.match(lines, /show up here/);
  assert.match(lines, /emoji/);
  assert.match(lines, /glows blue/);
  assert.match(lines, /signature/);
  assert.match(lines, /on the back/);
  assert.match(lines, /sample is gone/);
  assert.equal(lines.includes("This sample is only"), false);
  assert.equal(lines.includes("The front is the picture"), false);
  assert.equal(FEATURE_WALK_KEY, "relapse.featureWalk");
});

test("everyone sees the walk once, then only a new profile or the menu", () => {
  assert.equal(featureWalkSeen(null), false);
  assert.equal(featureWalkSeen("seen"), true);
  assert.equal(featureWalkDue({ seen: false, profileCreated: false, fromMenu: false }), true);
  assert.equal(featureWalkDue({ seen: true, profileCreated: false, fromMenu: false }), false);
  assert.equal(featureWalkDue({ seen: true, profileCreated: true, fromMenu: false }), true);
  assert.equal(featureWalkDue({ seen: true, profileCreated: false, fromMenu: true }), true);
});

test("the walk is a sample, not a standing tip, and the menu can start it", () => {
  const walk = readFileSync(new URL("./walkthrough.ts", import.meta.url), "utf8");
  const feature = readFileSync(new URL("../components/FeatureWalk.tsx", import.meta.url), "utf8");
  const feed = readFileSync(new URL("../components/Feed.tsx", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../components/Lab.tsx", import.meta.url), "utf8");
  const sleeve = readFileSync(new URL("../components/Sleeve.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(walk, /sample is not saved/);
  assert.match(feature, /data-sample-photo/);
  assert.match(feature, /step\.id !== "feed"/);
  assert.match(feature, /data-feature-walk/);
  assert.match(feature, /\/recap\/roof\.png/);
  assert.equal(feed.includes("WalkTip"), false);
  assert.equal(feed.includes("WalkMark"), false);
  assert.equal(feed.includes("useWalk"), false);
  assert.equal(lab.includes("WalkTip"), false);
  assert.equal(lab.includes("WalkMark"), false);
  assert.equal(lab.includes("useWalk"), false);
  assert.match(sleeve, /Feature Walkthrough/);
  assert.match(sleeve, /data-sleeve-item="feature-walk"/);
  assert.match(app, /FeatureWalk/);
  assert.match(app, /onProfileCreated/);
  assert.match(app, /FEATURE_WALK_KEY/);
  assert.match(app, /data-nav=\{id\}/);
  assert.match(app, /data-walk-step/);
  assert.match(css, /data-walk-step="feed"/);
  assert.match(css, /data-nav="feed"/);
});
