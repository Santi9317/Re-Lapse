import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { notesControlForUpdate, notesPromptOnEntry, publishedReleaseFromJson, RELEASE_NOTES } from "./release-notes.ts";
import { APP_VERSION } from "./release.ts";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function git(args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

test("the menu version is the string package.json ships", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version?: string };
  assert.equal(pkg.version, APP_VERSION);
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
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
  assert.equal(Array.isArray(release.notes), true);
  assert.ok(release.notes && release.notes.length > 0);
  assert.ok(RELEASE_NOTES.length > 0);
  for (const line of RELEASE_NOTES) assert.equal(line, line.trim());
  assert.deepEqual(release.notes, [...RELEASE_NOTES]);
  assert.deepEqual(publishedReleaseFromJson(release), { version: APP_VERSION, notes: [...RELEASE_NOTES] });
  assert.deepEqual(
    [...RELEASE_NOTES],
    [
      "When photos are ready, one large frame shows how many, and Develop opens them.",
      "Swipe right to send a photo to the Feed. Skip the caption with one tap, or write one.",
      "A small undo sits with that swipe.",
      "Darkroom still lists each photo, including ones that are ready, with a bath for each.",
    ],
  );
  const notes = RELEASE_NOTES.join("\n");
  const lower = notes.toLowerCase();
  for (const older of [
    "See what's new when you open the camera, if you have not read this update.",
    "The camera turns off when you leave Shoot, and a tap on Shoot turns it back on.",
    "Tap a sticker to see who stuck it, with a small photo, their name, and that emoji.",
    "Sign a note on the back. Your marks sit beside it, and you can delete your own.",
    "The line of cameras waiting to join stays short, so a new browser cannot fill it.",
    "A name on the feed is not enough to guess that profile's PIN.",
    "The shutter flash lasts a little longer, so you can see that the photo was taken.",
    "Tap Daylight or Night again to clear it. With neither picked, Develop uses the usual bath.",
    "Download and Delete sit as small text under a photo.",
    "Write a caption while a photo is on its way to the feed. Once it is up, that line stays as it is.",
    "Tap a frame to read notes written on the back.",
    "Type a note under the photo, and tap the plus to pick any emoji.",
    "The home screen asks once to show the icon count, and remembers the answer.",
    "General, in the You menu, shows that choice and lets you change it.",
    "Each phone keeps its own allowance, so one phone cannot use up another's.",
    "The home screen icon counts frames ready to develop, new feed photos, and opened timecapsules.",
    "The gate icon counts cameras waiting to join and profiles asking to come back.",
    "The version counts a fix, a feature, or a breaking change.",
    "A new booth keeps the same allowance for new cameras.",
    "Tap Re-Lapse for a line of inspiration.",
    "Posted photos leave off the RE-LAPSE 400 line.",
    "Adding the camera walks through the Home Screen steps.",
    "The Home Screen shortcut stays unless the icon changes.",
    "The header says tinker with the bath.",
    "Daylight and Night are under Additional chemistry.",
    "Wednesday's date stamp reads as a W.",
    "Your home screen icon changes to the wink.",
    "New photos and other changes show up when you switch tabs.",
    "The date stamp switch sits with your prints. A developed frame gets the date only when it is on.",
    "A caption shows up on a photo after you send it to the feed.",
    "The shutter sends the frame on, and the next shot is ready right away.",
    "Pick when a timecapsule opens. It stays open for the hours you chose, and you can see it a day after it closes.",
    "Every tab can be pulled down to refresh, and the tab shows A little more, then In the soup.",
    "Sign the back of a gallery photo you shot.",
    "Save a changed album title, or leave if unchanged, and return to Keepsakes. A blank title or a failed save stays and shows the error.",
    "The Feed dot and the Home Screen count include someone else's new photo, a note you did not write, or a pin you did not place.",
    "The new photo, note, and pin leave the Feed dot and the Home Screen count once the Feed list has loaded, and stay off while Feed is open.",
    "An emoji you did not place keeps a cyan ring until that look ends.",
    "A frame with a note you did not write keeps that cyan outline until you open the back. Scrolling past the front leaves it.",
    "Keepsakes does not get a mark for these.",
    "The Shoot preview is the same paper print the shutter saves.",
    "Keepsakes opens on Galleries and Time Capsules.",
    "First-use tips can be dismissed, skipped, or brought back.",
    "A tap adds another emoji, and you can remove just that one.",
    "The Feed opens with a swipe recap of new frames, then a wrap-up of new notes and reactions.",
    "One print at a time. Swipe right keeps, swipe left deletes, and undo lasts until you leave the tab. Soup opens the chemistry list.",
    "A gallery has a Shoot button. Those photos still develop, and keeping one files it in that gallery. The marker matches a time capsule.",
    "Pull down to refresh on Feed, Keepsakes, You, and where frames develop. The tab shows A little more, then In the soup.",
    "Swipe one print at a time. Right keeps it, left deletes it, and Soup opens the chemistry list.",
    "Keepsakes opens as two halves: Galleries, and Time Capsules.",
    "When the Feed has new frames, it opens on a swipe recap and then the new notes and reactions.",
    "A sample photo shows the Feed and the notes on the back of a frame, then that sample is gone.",
    "Feature Walkthrough in You starts the sample again, and so does making a profile.",
    "A photo can belong to more than one gallery. Adding it to another leaves the first one.",
    "The Feed does not show a gallery name on a frame.",
    "An emoji can be moved by the person who placed it, and by the one who shot the frame.",
    "The walk opens on the Feed tab. The sample photo comes next, for emojis, notes, and the blue glow, and it is not saved.",
    "Tap the tab you are already on to return to its home. Keepsakes returns to Galleries and Time Capsules.",
    "Frames you can develop come first. Tap one, then swipe to keep or discard, and add a caption while you swipe.",
    "Darkroom keeps the countdown and the chemistry. A photo you just took shows up there.",
    "You can write and sign the back of a frame you shot, from the Feed.",
    "A wrong gate key counts for this browser. Another visitor does not use up those tries.",
    "Double-tap a photo you shot to place an emoji on it.",
    "Tap Feed while it is already open to return home and scroll back to the top.",
    "The walk opens on the Feed, then emojis, then signatures. The sample photo is not saved.",
    "New emojis glow blue. Frames glow blue when they have unread signatures.",
  ]) {
    assert.equal(notes.includes(older), false);
  }
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
  assert.equal(publishedReleaseFromJson({ version: "9.1" }), null);
  assert.equal(publishedReleaseFromJson({ version: "9.1", notes: [] })?.notes.length, 0);
});

test("a version bump offers what's new on entry without a waiting update", () => {
  const unseen = notesControlForUpdate({
    published: { version: APP_VERSION, notes: [...RELEASE_NOTES] },
    bundledVersion: APP_VERSION,
    bundledNotes: [...RELEASE_NOTES],
    seen: null,
  });
  assert.ok(unseen);
  assert.ok(unseen.notes.length > 0);
  // Opening the app with no service worker waiting still offers the control.
  assert.equal(notesPromptOnEntry({ offer: unseen, updateOpen: false, updateSettled: true, blocked: false }), true);
  const fromBundle = notesControlForUpdate({
    published: null,
    bundledVersion: APP_VERSION,
    bundledNotes: [...RELEASE_NOTES],
    seen: null,
  });
  assert.ok(fromBundle);
  assert.equal(notesPromptOnEntry({ offer: fromBundle, updateOpen: false, updateSettled: true, blocked: false }), true);
  // Empty or missing notes stay hidden, so the file check above has to fail the run.
  assert.equal(
    notesControlForUpdate({
      published: { version: APP_VERSION, notes: [] },
      bundledVersion: APP_VERSION,
      bundledNotes: [...RELEASE_NOTES],
      seen: null,
    }),
    null,
  );
  assert.equal(
    notesPromptOnEntry({ offer: { notes: [] }, updateOpen: false, updateSettled: true, blocked: false }),
    false,
  );
  assert.equal(notesPromptOnEntry({ offer: null, updateOpen: false, updateSettled: true, blocked: false }), false);
  assert.equal(notesPromptOnEntry({ offer: unseen, updateOpen: true, updateSettled: true, blocked: false }), false);
  assert.equal(notesPromptOnEntry({ offer: unseen, updateOpen: false, updateSettled: false, blocked: false }), false);
  assert.equal(notesPromptOnEntry({ offer: unseen, updateOpen: false, updateSettled: true, blocked: true }), false);

  const shell = readFileSync(new URL("../components/Shell.tsx", import.meta.url), "utf8");
  assert.equal(shell.includes("if (!updateOpen || !releaseReady"), false);
  assert.match(shell, /notesPromptOnEntry\(\{/);
  assert.match(shell, /\{notesVisible && notesOffer \? \([\s\S]*?data-shell="notes"/);
  const updateAt = shell.indexOf('data-shell="update"');
  const notesAt = shell.indexOf('data-shell="notes"');
  const homeAt = shell.indexOf('data-shell="home"');
  assert.ok(updateAt >= 0 && notesAt > updateAt && homeAt > notesAt);
  const updateSheet = shell.slice(updateAt, notesAt);
  const notesSheet = shell.slice(notesAt, homeAt);
  assert.match(updateSheet, /data-release-notes-control/);
  assert.match(updateSheet, /See what's new/);
  assert.match(notesSheet, /data-release-notes-control/);
  assert.match(notesSheet, /See what's new/);
  assert.equal(updateSheet.includes('data-shell="notes"'), false);
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.lab-sheet\[data-shell="update"\] \.sheet-card,\s*\.lab-sheet\[data-shell="notes"\] \.sheet-card \{[^}]*max-height:\s*100%/);
  assert.match(css, /\.sheet-notes \{[^}]*overflow-y:\s*auto/);

  const baseSource = git(["show", "origin/main:src/lib/release.ts"]);
  const baseReleaseText = git(["show", "origin/main:public/release.json"]);
  if (baseSource === null || baseReleaseText === null) return;
  const baseVersion = /export const APP_VERSION = "([^"]+)"/.exec(baseSource)?.[1];
  if (!baseVersion || baseVersion === APP_VERSION) return;
  const baseRelease = JSON.parse(baseReleaseText) as { notes?: unknown };
  const release = JSON.parse(readFileSync(new URL("../../public/release.json", import.meta.url), "utf8")) as {
    notes?: unknown;
  };
  assert.ok(Array.isArray(release.notes) && release.notes.length > 0);
  assert.notDeepEqual(release.notes, baseRelease.notes);
  const bumped = notesControlForUpdate({
    published: { version: APP_VERSION, notes: [...RELEASE_NOTES] },
    bundledVersion: baseVersion,
    bundledNotes: [],
    seen: baseVersion,
  });
  assert.ok(bumped);
  assert.deepEqual([...bumped.notes], [...RELEASE_NOTES]);
  assert.equal(notesPromptOnEntry({ offer: bumped, updateOpen: false, updateSettled: true, blocked: false }), true);
});
