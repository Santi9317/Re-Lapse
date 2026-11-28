import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAIN_TABS } from "./refresh.ts";
import { feedHomeScroll, tabTapHomes } from "./tab-home.ts";

test("tapping the open tab asks for that tab's home", () => {
  for (const current of MAIN_TABS) {
    for (const tapped of MAIN_TABS) {
      assert.equal(tabTapHomes(current, tapped), current === tapped);
    }
  }
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const feed = readFileSync(new URL("../components/Feed.tsx", import.meta.url), "utf8");
  const rolls = readFileSync(new URL("../components/Rolls.tsx", import.meta.url), "utf8");
  const deck = readFileSync(new URL("../components/LabDeck.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../components/Profile.tsx", import.meta.url), "utf8");
  assert.match(app, /tabTapHomes\(tabNow\.current, next\)/);
  assert.match(app, /setHomeTick/);
  assert.match(app, /homeTick=\{homeTick\}/);
  assert.match(app, /if \(next === "feed"\) setRecapDone\(true\)/);
  assert.match(app, /<Feed[\s\S]*?homeTick=\{homeTick\}/);
  assert.deepEqual(feedHomeScroll(false), { top: 0, behavior: "smooth" });
  assert.deepEqual(feedHomeScroll(true), { top: 0, behavior: "auto" });
  assert.match(feed, /feedHomeScroll\(/);
  assert.match(feed, /scrollTo\(feedHomeScroll\(/);
  assert.match(rolls, /setLane\(hub \? "hub" : "all"\)/);
  assert.match(rolls, /setGalleryId\(null\)/);
  assert.match(rolls, /setEventDetail\(null\)/);
  assert.match(deck, /setPlace\("select"\)/);
  assert.match(profile, /setOpenGallery\(null\)/);
  assert.match(profile, /setMode\("page"\)/);
});
