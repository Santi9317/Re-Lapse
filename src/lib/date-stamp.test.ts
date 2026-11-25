import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { developStampDate } from "./date-stamp.ts";

test("a developed print gets a date only when the switch is on and the shutter kept a time", () => {
  const captured = Date.parse("2026-11-25T17:10:00.000Z");
  const stamped = developStampDate(true, captured);
  assert.equal(stamped?.getTime(), captured);
  assert.equal(developStampDate(false, captured), undefined);
  assert.equal(developStampDate(true, null), undefined);
  assert.equal(developStampDate(true, Number.NaN), undefined);
});

test("the shutter sends the frame, the date switch lives with the prints, and the caption is written before the feed", () => {
  const shoot = readFileSync(new URL("../components/Shoot.tsx", import.meta.url), "utf8");
  const lab = readFileSync(new URL("../components/Lab.tsx", import.meta.url), "utf8");
  const print = readFileSync(new URL("../components/Print.tsx", import.meta.url), "utf8");
  const field = readFileSync(new URL("../components/CaptionField.tsx", import.meta.url), "utf8");
  const feed = readFileSync(new URL("../components/Feed.tsx", import.meta.url), "utf8");
  const rolls = readFileSync(new URL("../components/Rolls.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const filter = readFileSync(new URL("./filter.ts", import.meta.url), "utf8");

  assert.equal(shoot.includes("stamp-toggle"), false);
  assert.equal(shoot.includes("Caption, if you want one"), false);
  assert.equal(shoot.includes("Send to the lab"), false);
  assert.equal(shoot.includes("data-review"), false);
  assert.match(shoot, /void handoff\(/);
  assert.match(shoot, /sendPhoto\(/);
  assert.match(shoot, /renderLatent\(bitmap\)/);
  assert.match(shoot, /readDateStamp\(\)/);

  assert.match(lab, /className="stamp-toggle"/);
  assert.match(lab, /data-date-stamp=\{stamp \? "on" : "off"\}/);
  assert.match(lab, /developStampDate\(stampRef\.current, item\.capturedAt\)/);
  assert.match(lab, /<CaptionField/);
  assert.equal(lab.includes("No caption."), false);

  assert.match(field, /placeholder="Caption, if you want one"/);
  assert.match(print, /editable && item\.mine && !item\.onFeed && item\.eventId/);
  assert.equal(print.includes("item.mine && item.onFeed"), false);
  assert.equal(feed.includes("onCaption"), false);
  assert.equal(feed.includes("CaptionField"), false);
  assert.match(rolls, /picked\.has\(photo\.id\) && photo\.mine && !photo\.onFeed/);

  const desk = app.slice(app.indexOf("function CameraDesk"));
  const sent = /onSent=\{\(\) => \{[\s\S]*?\}\}/.exec(desk)?.[0] ?? "";
  assert.match(sent, /setLabRevision/);
  assert.equal(sent.includes("chooseTab"), false);

  assert.match(filter, /date: options\.dateStamp \? \(options\.date \?\? null\) : null/);
});
