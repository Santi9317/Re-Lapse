import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CAMERA_BADGE_PERMISSION_KEY,
  GATE_BADGE_PERMISSION_KEY,
  appBadgeCount,
  applyAppBadge,
  armBadgePermission,
  badgePermissionPlan,
  frameReadyToDevelop,
  gateBadgeCount,
  readBadgePermission,
  timecapsuleOpened,
  type AppBadgeHost,
} from "./badge.ts";

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

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

const installed = { ios: true, standalone: true, canBadge: true };

test("a stored badge answer is granted, denied, or the one prompt that was dismissed", () => {
  assert.equal(readBadgePermission(null), null);
  assert.equal(readBadgePermission("yes"), null);
  assert.equal(readBadgePermission("granted"), "granted");
  assert.equal(readBadgePermission("denied"), "denied");
  assert.equal(readBadgePermission("default"), "default");
});

test("iOS asks once for the icon count, and a remembered answer stays quiet", () => {
  const quiet = { ask: false, remember: null };
  assert.deepEqual(badgePermissionPlan({ ...installed, ios: false, stored: null, permission: "default" }), quiet);
  assert.deepEqual(badgePermissionPlan({ ...installed, standalone: false, stored: null, permission: "default" }), quiet);
  assert.deepEqual(badgePermissionPlan({ ...installed, canBadge: false, stored: null, permission: "default" }), quiet);
  assert.deepEqual(badgePermissionPlan({ ...installed, stored: "granted", permission: "default" }), quiet);
  assert.deepEqual(badgePermissionPlan({ ...installed, stored: "denied", permission: "default" }), quiet);
  assert.deepEqual(badgePermissionPlan({ ...installed, stored: "default", permission: "default" }), quiet);
  assert.deepEqual(badgePermissionPlan({ ...installed, stored: null, permission: "granted" }), {
    ask: false,
    remember: "granted",
  });
  assert.deepEqual(badgePermissionPlan({ ...installed, stored: null, permission: "denied" }), {
    ask: false,
    remember: "denied",
  });
  assert.deepEqual(badgePermissionPlan({ ...installed, stored: null, permission: "default" }), {
    ask: true,
    remember: null,
  });
  assert.deepEqual(badgePermissionPlan({ ...installed, stored: null, permission: null }), quiet);
});

test("the first tap asks iOS, and that answer is what later visits read", async () => {
  const storage = memory();
  let asks = 0;
  let handler: (() => void) | null = null;
  const stop = armBadgePermission({
    storage,
    key: CAMERA_BADGE_PERMISSION_KEY,
    ...installed,
    permission: "default",
    requestPermission: () => {
      asks += 1;
      return Promise.resolve("granted");
    },
    listen(next) {
      handler = next;
      return () => {
        handler = null;
      };
    },
  });
  assert.equal(asks, 0);
  handler?.();
  handler?.();
  await Promise.resolve();
  assert.equal(asks, 1);
  assert.equal(storage.getItem(CAMERA_BADGE_PERMISSION_KEY), "granted");
  stop();

  let again = 0;
  armBadgePermission({
    storage,
    key: CAMERA_BADGE_PERMISSION_KEY,
    ...installed,
    permission: "default",
    requestPermission: () => {
      again += 1;
      return Promise.resolve("denied");
    },
    listen() {
      return () => {};
    },
  });
  assert.equal(again, 0);
  assert.equal(storage.getItem(CAMERA_BADGE_PERMISSION_KEY), "granted");
});

test("a choice iOS already made is stored without asking again", () => {
  const storage = memory();
  let listened = false;
  armBadgePermission({
    storage,
    key: GATE_BADGE_PERMISSION_KEY,
    ...installed,
    permission: "denied",
    requestPermission: () => Promise.resolve("granted"),
    listen() {
      listened = true;
      return () => {};
    },
  });
  assert.equal(listened, false);
  assert.equal(storage.getItem(GATE_BADGE_PERMISSION_KEY), "denied");
});

test("the desk paints that count and does not add a banner", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../components/GatePortal.tsx", import.meta.url), "utf8");
  assert.match(app, /frameReadyToDevelop/);
  assert.match(app, /noteFeedLook/);
  assert.match(app, /timecapsuleOpened/);
  assert.match(app, /applyAppBadge\(\s*appBadgeCount\(/);
  assert.match(app, /watchIosBadgePermission\(CAMERA_BADGE_PERMISSION_KEY\)/);
  assert.equal(app.includes("gateBadgeCount"), false);
  assert.equal(app.includes("requestPermission"), false);
  assert.equal(app.includes("new Notification"), false);
  assert.equal(app.includes('className="banner"'), false);
  assert.match(gate, /applyAppBadge\(\s*gateBadge/);
  assert.match(gate, /watchIosBadgePermission\(GATE_BADGE_PERMISSION_KEY\)/);
  assert.equal(gate.includes("appBadgeCount"), false);
  assert.equal(gate.includes("frameReadyToDevelop"), false);
  assert.equal(gate.includes("requestPermission"), false);
  assert.equal(gate.includes("new Notification"), false);
});
