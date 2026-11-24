import assert from "node:assert/strict";
import test from "node:test";
import {
  isIosDevice,
  isSafariUa,
  isStandaloneDisplay,
  shouldAskForHome,
  shouldClearUpdateAcceptance,
  updateDecision,
} from "./shell.ts";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:128.0) Gecko/20100101 Firefox/128.0";

test("safari includes iOS Safari and desktop Safari", () => {
  assert.equal(isSafariUa(IOS_SAFARI), true);
  assert.equal(isSafariUa(MAC_SAFARI), true);
  assert.equal(isSafariUa(CHROME), false);
  assert.equal(isSafariUa(IOS_CHROME), false);
  assert.equal(isSafariUa(FIREFOX), false);
});

test("home prompt is once, Safari-only, and never when installed", () => {
  const open = { safari: true, standalone: false, stored: null, legacyHidden: false };
  assert.equal(shouldAskForHome(open), true);
  assert.equal(shouldAskForHome({ ...open, safari: false }), false);
  assert.equal(shouldAskForHome({ ...open, standalone: true }), false);
  assert.equal(shouldAskForHome({ ...open, stored: "no" }), false);
  assert.equal(shouldAskForHome({ ...open, stored: "yes" }), false);
  assert.equal(shouldAskForHome({ ...open, legacyHidden: true }), false);
  assert.equal(isStandaloneDisplay(true, undefined), true);
  assert.equal(isStandaloneDisplay(false, true), true);
  assert.equal(isStandaloneDisplay(false, false), false);
});

test("iOS steps are for iPhone, iPad, and iPadOS desktop UA", () => {
  assert.equal(isIosDevice(IOS_SAFARI, "iPhone", 5), true);
  assert.equal(isIosDevice("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1", "iPad", 5), true);
  assert.equal(isIosDevice(MAC_SAFARI, "MacIntel", 5), true);
  assert.equal(isIosDevice(MAC_SAFARI, "MacIntel", 0), false);
});

test("an accepted update finishes quietly instead of showing again", () => {
  assert.equal(updateDecision({ hasController: false, hasActive: false, hasWaiting: true, accepted: false }), "idle");
  assert.equal(updateDecision({ hasController: true, hasActive: true, hasWaiting: true, accepted: false }), "show");
  assert.equal(updateDecision({ hasController: true, hasActive: true, hasWaiting: true, accepted: true }), "finish");
  assert.equal(updateDecision({ hasController: true, hasActive: true, hasWaiting: false, accepted: true }), "idle");
  assert.equal(shouldClearUpdateAcceptance({ hasWaiting: false, hasInstalling: false }), true);
  assert.equal(shouldClearUpdateAcceptance({ hasWaiting: true, hasInstalling: false }), false);
});

test("a homescreen open can show the update before the page is claimed", () => {
  assert.equal(updateDecision({ hasController: false, hasActive: true, hasWaiting: true, accepted: false }), "show");
  assert.equal(updateDecision({ hasController: false, hasActive: true, hasWaiting: true, accepted: true }), "finish");
  assert.equal(updateDecision({ hasController: false, hasActive: true, hasWaiting: false, accepted: false }), "idle");
});
