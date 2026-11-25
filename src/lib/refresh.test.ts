import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  listsForLanding,
  MAIN_TABS,
  shouldReloadOnPageSignal,
  shouldReloadOnTabChange,
  type MainTab,
} from "./refresh.ts";

test("moving to another main tab reloads the lists on that tab", () => {
  const tabs: MainTab[] = [...MAIN_TABS];
  for (const from of tabs) {
    for (const to of tabs) {
      assert.equal(shouldReloadOnTabChange(from, to), from !== to);
    }
  }
  assert.deepEqual(listsForLanding("feed", false), ["feed"]);
  assert.deepEqual(listsForLanding("rolls", false), ["keepsakes"]);
  assert.deepEqual(listsForLanding("you", false), ["profile"]);
  assert.deepEqual(listsForLanding("lab", false), ["lab"]);
  assert.deepEqual(listsForLanding("shoot", false), []);
  assert.deepEqual(listsForLanding("feed", true), ["guest"]);
  assert.deepEqual(listsForLanding("you", true), ["guest"]);
});

test("showing the page again reloads the open tab, and hide or blur does not", () => {
  assert.equal(shouldReloadOnPageSignal("show"), true);
  assert.equal(shouldReloadOnPageSignal("hide"), false);
  assert.equal(shouldReloadOnPageSignal("blur"), false);
  assert.equal(shouldReloadOnPageSignal("focus"), false);
});

test("a landing reloads lists without asking the camera to stop or the worker to skip waiting", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const refresh = readFileSync(new URL("./refresh.ts", import.meta.url), "utf8");
  assert.equal(app.includes("releaseCamera"), false);
  assert.equal(app.includes("getUserMedia"), false);
  assert.equal(app.includes("skipWaiting"), false);
  assert.equal(refresh.includes("releaseCamera"), false);
  assert.equal(refresh.includes("getUserMedia"), false);
  assert.equal(refresh.includes("skipWaiting"), false);
});
