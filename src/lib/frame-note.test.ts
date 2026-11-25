import assert from "node:assert/strict";
import test from "node:test";
import { NOTE_HANDS, noteHand, pickNoteHand } from "./frame-note.ts";

test("a note keeps one of the handwriting faces", () => {
  assert.equal(noteHand("caveat"), "caveat");
  assert.equal(noteHand("patrick"), "patrick");
  assert.equal(noteHand("kalam"), "kalam");
  assert.equal(noteHand("comic sans"), "caveat");
  assert.equal(noteHand(null), "caveat");
  for (let i = 0; i < 12; i += 1) assert.equal(NOTE_HANDS.includes(pickNoteHand()), true);
});
