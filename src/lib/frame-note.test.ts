import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NOTE_HANDS, noteHand, photoBackOpens, pickNoteHand } from "./frame-note.ts";

test("a note keeps one of the handwriting faces", () => {
  assert.equal(noteHand("caveat"), "caveat");
  assert.equal(noteHand("patrick"), "patrick");
  assert.equal(noteHand("kalam"), "kalam");
  assert.equal(noteHand("comic sans"), "caveat");
  assert.equal(noteHand(null), "caveat");
  for (let i = 0; i < 12; i += 1) assert.equal(NOTE_HANDS.includes(pickNoteHand()), true);
});

test("a photo turns over only for the person who shot it", () => {
  assert.equal(photoBackOpens(true), true);
  assert.equal(photoBackOpens(false), false);
  const print = readFileSync(new URL("../components/Print.tsx", import.meta.url), "utf8");
  const gallery = readFileSync(new URL("../components/Gallery.tsx", import.meta.url), "utf8");
  const feed = readFileSync(new URL("../components/Feed.tsx", import.meta.url), "utf8");
  assert.match(print, /const ownPhoto = photoBackOpens\(item\.mine\)/);
  assert.match(print, /const canOpenNotes = notes === "owner" \? ownPhoto : true/);
  assert.match(print, /const canWrite = Boolean\(onComments\) && \(notes === "owner" \? ownPhoto : true\)/);
  assert.match(print, /data-notes=\{canOpenNotes \? \(notes === "owner" \? "owner" : "feed"\) : "closed"\}/);
  assert.match(print, /\{canOpenNotes \? \(/);
  assert.match(gallery, /notes="owner"/);
  assert.match(gallery, /photo\.mine \? onPhotoNotes : undefined/);
  assert.match(gallery, /open\.mine \? onPhotoNotes : undefined/);
  assert.equal(feed.includes('notes="owner"'), false);
  assert.match(feed, /onComments=\{onComments\}/);
});
