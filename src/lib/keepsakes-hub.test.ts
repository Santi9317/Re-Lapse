import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { keepsakesHubOpen } from "./keepsakes-hub.ts";

test("the landing stays closed unless the address asks for it", () => {
  assert.equal(keepsakesHubOpen(""), false);
  assert.equal(keepsakesHubOpen("?join=ABC123"), false);
  assert.equal(keepsakesHubOpen("?keepsakes=list"), false);
  assert.equal(keepsakesHubOpen("?keepsakes=hub"), true);
  assert.equal(keepsakesHubOpen("?join=ABC123&keepsakes=hub"), true);
});

test("the tab still opens the combined keepsakes list, and the hub is two halves", () => {
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const rolls = readFileSync(new URL("../components/Rolls.tsx", import.meta.url), "utf8");
  const hub = readFileSync(new URL("../components/KeepsakesHub.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(app, /keepsakesHubOpen\(window\.location\.search\)/);
  assert.match(app, /hub=\{keepsakesHub\}/);
  assert.match(app, /tab === "rolls" \? \(/);
  assert.equal(app.includes('id === "rolls"'), false);

  assert.match(rolls, /hub \? "hub" : "all"/);
  assert.match(rolls, /data-screen="keepsakes"/);
  assert.match(rolls, /<h2 className="section">Galleries<\/h2>/);
  assert.match(rolls, /<h2 className="section">Timecapsules<\/h2>/);
  assert.match(rolls, /<KeepsakesHub/);

  assert.match(hub, /data-screen="keepsakes-hub"/);
  assert.match(hub, /data-hub="galleries"/);
  assert.match(hub, /data-hub="capsules"/);
  assert.match(hub, />Galleries</);
  assert.match(hub, />Time Capsules</);
  assert.match(css, /\.keepsakes-hub \{[^}]*grid-template-rows: 1fr 1fr/s);
});
