import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FEATURE_WALK, FEATURE_WALK_KEY, featureWalkDue, featureWalkSeen } from "./walkthrough.ts";

test("the walk is the feed, then emojis, then signatures", () => {
  assert.deepEqual(
    FEATURE_WALK.map((step) => step.id),
    ["feed", "emoji", "signatures"],
  );
  const [feed, emoji, signatures] = FEATURE_WALK;
  assert.equal(feed?.title, "The Feed");
  assert.equal(feed?.title.includes("Frames from this link"), false);
  assert.match(feed?.line ?? "", /show up here/);
  assert.equal(/emoji|signature|flip|glow/i.test(feed?.line ?? ""), false);

  assert.match(emoji?.line ?? "", /Double-tap a frame to add an emoji/);
  assert.match(emoji?.line ?? "", /Hold it down to drag it/);
  assert.match(emoji?.line ?? "", /Tap yours, then Remove, to take it off/);
  assert.match(emoji?.line ?? "", /Newly added emojis glow blue/);
  assert.equal(/flip|signature|\bback\b/i.test(emoji?.line ?? ""), false);

  assert.match(signatures?.line ?? "", /Tap once to flip the frame and write on the back/);
  assert.match(signatures?.line ?? "", /Frames glow blue for new unopened signatures and for unread signatures/);
  assert.equal((signatures?.line ?? "").match(/glow blue/gi)?.length, 1);
  assert.match(signatures?.line ?? "", /sample is gone/);
  assert.equal(/emoji|Double-tap|drag|Remove/i.test(signatures?.line ?? ""), false);
  const sentences = FEATURE_WALK.flatMap((step) =>
    step.line
      .split(/(?<=\.)\s+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 0),
  );
  assert.equal(new Set(sentences).size, sentences.length);
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
  assert.match(feature, /data-sample-emoji/);
  assert.match(feature, /data-sample-unread/);
  assert.match(feature, /step\.id === "signatures"/);
  assert.equal(feature.includes('step.id === "notes"'), false);
  assert.equal(feature.includes("Tap to turn it over"), false);
  assert.equal(feature.includes("localStorage"), false);
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
  assert.match(css, /\.feature-walk-frame\[data-sample-unread="true"\]/);
  assert.match(css, /\.feature-walk-emoji/);
  assert.match(css, /\.sheet-notes \{[^}]*overflow-y:\s*auto/);
});
