import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { appBadgeCount, applyAppBadge, frameReadyToDevelop, gateBadgeCount, timecapsuleOpened, type AppBadgeHost } from "./badge.ts";

test("a frame is ready to develop when the lab says so, including a clock that already hit zero", () => {
  const now = 1_000;
  assert.equal(frameReadyToDevelop({ labState: "ready", readyAt: now + 5 }, now), true);
  assert.equal(frameReadyToDevelop({ labState: "developing", readyAt: now }, now), true);
  assert.equal(frameReadyToDevelop({ labState: "developing", readyAt: now - 1 }, now), true);
  assert.equal(frameReadyToDevelop({ labState: "developing", readyAt: now + 1 }, now), false);
  assert.equal(frameReadyToDevelop({ labState: "sealed", readyAt: now - 1 }, now), false);
  assert.equal(frameReadyToDevelop({ labState: "developed", readyAt: now - 1 }, now), false);
});

test("an opened timecapsule is the roll that came back", () => {
  assert.equal(timecapsuleOpened({ status: "ready" }), true);
  assert.equal(timecapsuleOpened({ status: "open" }), false);
  assert.equal(timecapsuleOpened({ status: "sealing" }), false);
});

test("the icon count adds ready frames, unseen posts, and opened timecapsules", () => {
  assert.equal(appBadgeCount(2, 3, 1), 6);
  assert.equal(appBadgeCount(0, 0, 0), 0);
  assert.equal(appBadgeCount(4, 0, 0), 4);
});

test("the gate icon counts join requests and retrievals, apart from the camera", () => {
  assert.equal(gateBadgeCount(2, 1), 3);
  assert.equal(gateBadgeCount(0, 0), 0);
  assert.equal(gateBadgeCount(4, 0), 4);
  assert.equal(appBadgeCount(2, 3, 1), 6);
});

test("the installed icon takes the count, and zero clears it", async () => {
  const calls: string[] = [];
  const host: AppBadgeHost = {
    setAppBadge: async (count) => {
      calls.push(`set:${count}`);
    },
    clearAppBadge: async () => {
      calls.push("clear");
    },
  };
  await applyAppBadge(6, host);
  await applyAppBadge(0, host);
  assert.deepEqual(calls, ["set:6", "clear"]);
});

test("a platform without a badge keeps the call quiet", async () => {
  await applyAppBadge(4, null);
  await applyAppBadge(0, {});
  const setOnly: AppBadgeHost = {
    setAppBadge: async (count) => {
      assert.equal(count, 0);
    },
  };
  await applyAppBadge(0, setOnly);
  let set = 0;
  const rejecting: AppBadgeHost = {
    setAppBadge: async () => {
      set += 1;
      throw new Error("not installed");
    },
    clearAppBadge: async () => {
      throw new Error("not installed");
    },
  };
  await applyAppBadge(2, rejecting);
  await applyAppBadge(0, rejecting);
  assert.equal(set, 1);
});

test("the desk paints that count and does not add a banner", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../components/GatePortal.tsx", import.meta.url), "utf8");
  assert.match(app, /frameReadyToDevelop/);
  assert.match(app, /noteFeedLook/);
  assert.match(app, /timecapsuleOpened/);
  assert.match(app, /applyAppBadge\(\s*appBadgeCount\(/);
  assert.equal(app.includes("gateBadgeCount"), false);
  assert.equal(app.includes("requestPermission"), false);
  assert.equal(app.includes("new Notification"), false);
  assert.equal(app.includes('className="banner"'), false);
  assert.match(gate, /applyAppBadge\(\s*gateBadge/);
  assert.equal(gate.includes("appBadgeCount"), false);
  assert.equal(gate.includes("frameReadyToDevelop"), false);
  assert.equal(gate.includes("requestPermission"), false);
});
