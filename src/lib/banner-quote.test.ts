import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { bannerOpensQuote } from "./banner-quote.ts";
import { INSPIRATION_KEY, QUOTES, drawInspiration } from "./quotes.ts";
import { MAIN_TABS, type MainTab } from "./refresh.ts";

test("the Re-Lapse banner opens one inspiration line on every tab except Shoot", () => {
  const tabs: MainTab[] = [...MAIN_TABS];
  assert.deepEqual(
    tabs.filter((tab) => bannerOpensQuote(tab)),
    ["lab", "feed", "rolls", "you"],
  );
  assert.equal(bannerOpensQuote("shoot"), false);
});

test("a tap draws one existing line and the next tap draws another", () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
  const first = drawInspiration(storage, () => 0);
  const second = drawInspiration(storage, () => 0);
  assert.equal(QUOTES.includes(first), true);
  assert.equal(QUOTES.includes(second), true);
  assert.equal(first.id, QUOTES[0]?.id);
  assert.notEqual(second.id, first.id);
  assert.equal(memory.get(INSPIRATION_KEY), second.id);
});

test("the banner dialog uses the sleeve's quotes, and Shoot does not open it", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const shoot = readFileSync(new URL("../components/Shoot.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../components/QuoteDialog.tsx", import.meta.url), "utf8");
  const sleeve = readFileSync(new URL("../components/Sleeve.tsx", import.meta.url), "utf8");
  const desk = app.slice(app.indexOf("function CameraDesk"));
  const offer = /bannerOpensQuote\(tab\) \? \([\s\S]*?\) : null/.exec(desk)?.[0] ?? "";
  assert.match(offer, /<h1 className="word">/);
  assert.match(offer, /<button[^>]*onClick=\{openBannerQuote\}[^>]*>\s*Re-Lapse ✨\s*<\/button>/);
  assert.match(desk, /drawInspiration\(localStorage\)/);
  assert.match(app, /Let them lapse\. Develop when the clock hits zero, tinker with the bath\. 🧪/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /Escape/);
  assert.match(dialog, />\s*Close\s*</);
  assert.match(dialog, /quote\.text/);
  assert.match(dialog, /quote\.author/);
  assert.match(dialog, /quote\.emoji/);
  assert.equal(/export const QUOTES/.test(dialog), false);
  assert.match(sleeve, /drawInspiration\(localStorage\)/);
  assert.match(sleeve, /relapse\.inspiration|INSPIRATION_KEY|drawInspiration/);
  assert.match(shoot, /<div className="brand">Re-Lapse ✨<\/div>/);
  assert.equal(shoot.includes("drawInspiration"), false);
  assert.equal(shoot.includes("pickQuote"), false);
  assert.equal(shoot.includes("QuoteDialog"), false);
  assert.equal(shoot.includes("bannerOpensQuote"), false);
});
