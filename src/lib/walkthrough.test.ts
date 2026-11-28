import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HOW_TO } from "./howto.ts";
import {
  WALK_AGAIN,
  WALK_IDS,
  WALK_TIPS,
  applyWalk,
  commitWalk,
  freshWalkBook,
  pickWalk,
  readWalkBook,
  walkMarkVisible,
  walkVisible,
  writeWalkBook,
  type WalkId,
} from "./walkthrough.ts";

test("three tips, one line each, and not a tour", () => {
  assert.deepEqual(
    WALK_TIPS.map((tip) => tip.id),
    ["flip", "feed", "lab"],
  );
  assert.equal(WALK_TIPS.length, WALK_IDS.length);
  for (const tip of WALK_TIPS) {
    assert.equal(tip.line.includes("\n"), false);
    assert.equal(tip.line.length < 64, true);
    assert.equal(tip.kicker.length < 16, true);
    assert.equal(WALK_AGAIN[tip.id].length < 16, true);
  }
  const lines = WALK_TIPS.map((tip) => tip.line).join(" ");
  assert.match(lines, /notes are on the back/);
  assert.match(lines, /Frames from this link/);
  assert.match(lines, /Download keeps it/);
  assert.match(lines, /Delete throws it out/);
  assert.equal(/shoot|zoom|sticker|timecapsule|profile|tutorial/i.test(lines), false);
});

test("dismiss, skip, and later stick, and a bad book stays fresh", () => {
  const fresh = freshWalkBook();
  assert.deepEqual(fresh, { flip: "new", feed: "new", lab: "new" });
  const dismissed = applyWalk(fresh, "flip", "dismiss");
  const skipped = applyWalk(dismissed, "feed", "skip");
  const later = applyWalk(skipped, "lab", "later");
  assert.equal(later.flip, "dismissed");
  assert.equal(later.feed, "skipped");
  assert.equal(later.lab, "later");
  assert.deepEqual(readWalkBook(writeWalkBook(later)), later);
  const saved = writeWalkBook(later);
  assert.deepEqual(commitWalk(saved, "flip", "later").feed, "skipped");
  assert.equal(commitWalk(saved, "flip", "later").flip, "later");
  assert.deepEqual(readWalkBook(null), fresh);
  assert.deepEqual(readWalkBook("{"), fresh);
  assert.deepEqual(readWalkBook(JSON.stringify({ flip: "nope", extra: "dismissed", feed: "skipped" })), {
    flip: "new",
    feed: "skipped",
    lab: "new",
  });
});

test("a tip shows once, stays quiet after got it or skip, and later returns on the next open", () => {
  const place = { placeOpen: true, held: false, asked: false };
  assert.equal(walkVisible({ status: "new", ...place }), true);
  assert.equal(walkVisible({ status: "dismissed", ...place }), false);
  assert.equal(walkVisible({ status: "skipped", ...place }), false);
  assert.equal(walkVisible({ status: "later", ...place }), true);
  assert.equal(walkVisible({ status: "later", placeOpen: true, held: true, asked: false }), false);
  assert.equal(walkVisible({ status: "dismissed", placeOpen: true, held: false, asked: true }), true);
  assert.equal(walkVisible({ status: "new", placeOpen: false, held: false, asked: true }), false);
  assert.equal(walkMarkVisible({ status: "new", placeOpen: true, tipOpen: false }), false);
  assert.equal(walkMarkVisible({ status: "dismissed", placeOpen: true, tipOpen: false }), true);
  assert.equal(walkMarkVisible({ status: "skipped", placeOpen: true, tipOpen: false }), true);
  assert.equal(walkMarkVisible({ status: "later", placeOpen: true, tipOpen: true }), false);
  assert.equal(walkMarkVisible({ status: "later", placeOpen: true, tipOpen: false }), true);
});

test("the feed shows one tip, and the place comes before the frame", () => {
  assert.equal(pickWalk({ feed: true, flip: true, lab: true }), "feed");
  assert.equal(pickWalk({ flip: true, lab: true }), "flip");
  assert.equal(pickWalk({ lab: true }), "lab");
  assert.equal(pickWalk({}), null);
});

test("the tips sit in place and do not take over the screen or the menu", () => {
  const walk = readFileSync(new URL("./walkthrough.ts", import.meta.url), "utf8");
  const tip = readFileSync(new URL("../components/Walkthrough.tsx", import.meta.url), "utf8");
  const feed = readFileSync(new URL("../components/Feed.tsx", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../components/Lab.tsx", import.meta.url), "utf8");
  const sleeve = readFileSync(new URL("../components/Sleeve.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(walk, /This is not a tour/);
  assert.equal(/role="dialog"|aria-modal/.test(tip), false);
  assert.match(tip, /data-walk-dismiss/);
  assert.match(tip, /data-walk-skip/);
  assert.match(tip, /data-walk-later/);
  assert.match(tip, /data-walk-again/);
  assert.match(walk, /relapse\.walkthrough/);
  assert.match(tip, /WALK_KEY/);
  assert.match(tip, /commitWalk/);
  assert.match(feed, /useWalk\("feed"/);
  assert.match(feed, /useWalk\("flip"/);
  assert.match(feed, /pickWalk/);
  assert.match(feed, /feedTookThisOpen/);
  assert.match(lab, /useWalk\("lab"/);
  assert.match(lab, /firstDeveloped/);
  assert.equal(sleeve.includes("walkthrough"), false);
  assert.equal(HOW_TO.some((section) => section.id === "flip" && /viewfinder/.test(section.body.join(" "))), true);
  assert.match(css, /\.walk-tip \{/);
  const ids: WalkId[] = ["flip", "feed", "lab"];
  assert.equal(ids.length, 3);
});
