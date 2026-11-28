import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PULL_MAX,
  PULL_THRESHOLD,
  dampPull,
  pullArm,
  pullCommits,
  pullMove,
  shouldHoldPull,
} from "./pull-refresh.ts";

test("a short pull does not commit and a long pull does", () => {
  assert.equal(dampPull(0), 0);
  assert.equal(dampPull(-12), 0);
  assert.equal(pullCommits(dampPull(24)), false);
  assert.equal(pullCommits(dampPull(36)), false);
  assert.equal(pullCommits(dampPull(160)), true);
  assert.ok(dampPull(80) > dampPull(40));
  assert.ok(dampPull(800) <= PULL_MAX);
  assert.ok(PULL_THRESHOLD < PULL_MAX);
});

test("a pull arms at the top and leaves fields, sheets, and pinches alone", () => {
  const open = { scrollTop: 0, onField: false, onDialog: false, pointers: 1 };
  assert.equal(pullArm(open), true);
  assert.equal(pullArm({ ...open, scrollTop: 1 }), true);
  assert.equal(pullArm({ ...open, scrollTop: 12 }), false);
  assert.equal(pullArm({ ...open, onField: true }), false);
  assert.equal(pullArm({ ...open, onDialog: true }), false);
  assert.equal(pullArm({ ...open, pointers: 2 }), false);
});

test("downward travel pulls, and a sideways or upward move cancels", () => {
  assert.equal(pullMove({ dx: 2, dy: 4, scrollTop: 0 }), "pending");
  assert.equal(pullMove({ dx: 4, dy: 28, scrollTop: 0 }), "pull");
  assert.equal(pullMove({ dx: 36, dy: 10, scrollTop: 0 }), "cancel");
  assert.equal(pullMove({ dx: 0, dy: -24, scrollTop: 0 }), "cancel");
  assert.equal(pullMove({ dx: 0, dy: 40, scrollTop: 20 }), "cancel");
  assert.equal(shouldHoldPull({ dx: 4, dy: 12, scrollTop: 0 }), true);
  assert.equal(shouldHoldPull({ dx: 20, dy: 8, scrollTop: 0 }), false);
  assert.equal(shouldHoldPull({ dx: 0, dy: 12, scrollTop: 8 }), false);
});

test("pull to refresh stays off Shoot and on the other tabs, and a pull does not stop the camera", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const shoot = read("../components/Shoot.tsx");
  const lab = read("../components/Lab.tsx");
  const feed = read("../components/Feed.tsx");
  const rolls = read("../components/Rolls.tsx");
  const profile = read("../components/Profile.tsx");
  const gallery = read("../components/Gallery.tsx");
  const recap = read("../components/FeedRecap.tsx");
  const app = read("../components/App.tsx");
  assert.equal(shoot.includes("PullRefresh"), false);
  assert.equal(shoot.includes("onRefresh="), false);
  assert.equal(/function refreshShoot/.test(shoot), false);
  for (const source of [lab, feed, rolls, profile, gallery, recap]) {
    assert.match(source, /PullRefresh/);
    assert.match(source, /onRefresh=/);
  }
  assert.match(shoot, /data-screen="shoot"/);
  assert.match(lab, /data-screen="lab"/);
  assert.match(feed, /data-screen="feed"/);
  assert.match(rolls, /data-screen="keepsakes"/);
  assert.match(rolls, /KeepsakesHub/);
  assert.match(profile, /data-screen="profile"/);
  assert.match(profile, /data-screen="guest-profile"/);
  assert.equal(app.includes("releaseCamera"), false);
  assert.equal(app.includes("getUserMedia"), false);
  assert.equal(app.includes("skipWaiting"), false);
});
