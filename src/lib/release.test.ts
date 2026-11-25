import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { notesControlForUpdate, publishedReleaseFromJson, RELEASE_NOTES } from "./release-notes.ts";
import { APP_VERSION } from "./release.ts";

test("the menu version is the string package.json ships", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: string };
  assert.equal(pkg.version, APP_VERSION);
  assert.match(APP_VERSION, /^\d+\.\d+$/);
});

test("this publish carries the same notes the camera can show", () => {
  const release = JSON.parse(readFileSync(new URL("../../public/release.json", import.meta.url), "utf8")) as {
    version?: string;
    notes?: string[];
  };
  const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
  const workerVersion = /const RELEASE_VERSION = "([^"]+)"/.exec(sw)?.[1];
  assert.equal(release.version, APP_VERSION);
  assert.equal(workerVersion, APP_VERSION);
  assert.deepEqual(release.notes, [...RELEASE_NOTES]);
  assert.deepEqual(publishedReleaseFromJson(release), { version: APP_VERSION, notes: [...RELEASE_NOTES] });
  const notes = RELEASE_NOTES.join("\n");
  const lower = notes.toLowerCase();
  assert.match(notes, /Tapping the empty profile photo adds a photo\./);
  assert.equal(/iphone|safari|android|deploy|pull request|\blab\b|\bsanti\b|\bmaker\b/.test(lower), false);
  for (const line of RELEASE_NOTES) assert.ok(line.length > 0 && line.length <= 140);
  const install = sw.slice(sw.indexOf('addEventListener("install"'), sw.indexOf('addEventListener("message"'));
  const installCode = install.replace(/\/\/.*$/gm, "");
  assert.equal(/skipWaiting\s*\(/.test(installCode), false);
  assert.match(sw, /type === "SKIP_WAITING"\) self\.skipWaiting\(\)/);
  const releaseFetch = /pathname === "\/release\.json"[\s\S]*?return;/.exec(sw)?.[0] ?? "";
  assert.match(releaseFetch, /fetch\(request\)/);
  assert.equal(releaseFetch.includes("cache.put"), false);
});

test("what's new shows once for the publish that wrote it", () => {
  const published = { version: "9.1", notes: ["A fresh roll of frames."] };
  const bundled = ["An older line."];
  assert.deepEqual(
    notesControlForUpdate({ published, bundledVersion: "9.0", bundledNotes: bundled, seen: null }),
    { version: "9.1", notes: ["A fresh roll of frames."] },
  );
  assert.equal(
    notesControlForUpdate({ published, bundledVersion: "9.0", bundledNotes: bundled, seen: "9.1" }),
    null,
  );
  assert.deepEqual(
    notesControlForUpdate({ published, bundledVersion: "9.0", bundledNotes: bundled, seen: "9.0" }),
    { version: "9.1", notes: ["A fresh roll of frames."] },
  );
  assert.equal(
    notesControlForUpdate({ published: { version: "9.2", notes: [] }, bundledVersion: "9.0", bundledNotes: bundled, seen: null }),
    null,
  );
  assert.deepEqual(
    notesControlForUpdate({ published: null, bundledVersion: "9.0", bundledNotes: bundled, seen: null }),
    { version: "9.0", notes: bundled },
  );
  assert.equal(
    notesControlForUpdate({ published: null, bundledVersion: "9.0", bundledNotes: bundled, seen: "9.0" }),
    null,
  );
  assert.equal(publishedReleaseFromJson({ version: "", notes: ["Hi"] }), null);
  assert.equal(publishedReleaseFromJson({ version: "9.1", notes: ["  ", 4] }), null);
});
