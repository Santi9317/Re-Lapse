import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  NOTE_SEEN_KEY,
  frameHasUnseenNote,
  noteNotesViewed,
  noteUnseen,
  readNoteBook,
  recallNotes,
  type NoteStamp,
} from "./note-seen.ts";

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

const note = (noteId: string, createdAt: number, mine = false): NoteStamp => ({
  photoId: "photo",
  noteId,
  createdAt,
  mine,
});

test("a stored note book is a baseline and opened note moments", () => {
  assert.equal(readNoteBook(null), null);
  assert.equal(readNoteBook(""), null);
  assert.equal(readNoteBook("{"), null);
  assert.equal(readNoteBook("[]"), null);
  assert.equal(readNoteBook('{"baseline":-1,"viewed":{}}'), null);
  assert.deepEqual(readNoteBook('{"baseline":10,"viewed":{"p:a":12,"bad":"no"}}'), {
    baseline: 10,
    viewed: { "p:a": 12 },
  });
});

test("the first look leaves every current note alone, and a later one outlines until the back opens", () => {
  const storage = memory();
  const early = note("ada", 50);
  recallNotes({ storage, notes: [early, note("me", 80, true)], now: 100 });
  assert.equal(noteUnseen(storage, early), false);
  assert.equal(noteUnseen(storage, note("me", 80, true)), false);
  assert.equal(frameHasUnseenNote(storage, [early]), false);
  assert.equal(readNoteBook(storage.getItem(NOTE_SEEN_KEY))?.baseline, 100);

  const fresh = note("bea", 150);
  recallNotes({ storage, notes: [early, fresh], now: 200 });
  assert.equal(readNoteBook(storage.getItem(NOTE_SEEN_KEY))?.baseline, 100);
  assert.equal(frameHasUnseenNote(storage, [fresh]), true);
  assert.equal(frameHasUnseenNote(storage, [note("me", 160, true)]), false);
  assert.equal(noteUnseen(storage, note("bea", 100)), false);

  assert.equal(noteNotesViewed(storage, [fresh]), true);
  assert.equal(frameHasUnseenNote(storage, [fresh]), false);
  assert.equal(noteNotesViewed(storage, [fresh]), false);

  const later = note("cam", 180);
  assert.equal(frameHasUnseenNote(storage, [fresh, later]), true);
  assert.equal(noteNotesViewed(storage, [fresh, later]), true);
  assert.equal(frameHasUnseenNote(storage, [fresh, later]), false);
});

test("a view before the first look does not invent a book", () => {
  const storage = memory();
  assert.equal(noteNotesViewed(storage, [note("ada", 20)]), false);
  assert.equal(storage.getItem(NOTE_SEEN_KEY), null);
  assert.equal(noteUnseen(storage, note("ada", 20)), false);
});

test("a note that has left the feed is forgotten", () => {
  const storage = memory();
  recallNotes({ storage, notes: [], now: 100 });
  const signed = note("ada", 150);
  assert.equal(noteNotesViewed(storage, [signed]), true);
  recallNotes({ storage, notes: [signed], now: 180 });
  assert.equal(noteUnseen(storage, signed), false);
  recallNotes({ storage, notes: [], now: 190 });
  assert.equal(noteUnseen(storage, signed), true);
});

test("scrolling past the front does not clear a note outline; turning the frame over does", () => {
  const storage = memory();
  recallNotes({ storage, notes: [], now: 100 });
  const fresh = note("bea", 150);
  assert.equal(frameHasUnseenNote(storage, [fresh]), true);
  assert.equal(readNoteBook(storage.getItem(NOTE_SEEN_KEY))?.viewed["photo:bea"], undefined);

  const print = readFileSync(new URL("../components/Print.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  const feed = readFileSync(new URL("../components/Feed.tsx", import.meta.url), "utf8");
  const gallery = readFileSync(new URL("../components/Gallery.tsx", import.meta.url), "utf8");
  const rolls = readFileSync(new URL("../components/Rolls.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");

  const watcher = print.slice(print.indexOf("Opening the back"), print.indexOf("const image ="));
  assert.ok(watcher.length > 0);
  assert.match(watcher, /if \(!turned\) return/);
  assert.match(watcher, /noteNotesViewed\(localStorage/);
  assert.equal(watcher.includes("IntersectionObserver"), false);
  assert.equal((print.match(/new IntersectionObserver/g) ?? []).length, 2);
  assert.match(print, /data-note-unseen=\{noteFresh \? "true" : undefined\}/);
  assert.match(print, /noteSignal && item\.onFeed && noteRev >= 0 && frameHasUnseenNote/);
  assert.match(css, /\.frame-stage\[data-note-unseen="true"\] \.frame/);
  assert.match(css, /0 0 0 3px var\(--signal\)/);
  assert.match(feed, /noteSignal/);
  assert.equal(gallery.includes("noteSignal"), false);
  assert.equal(rolls.includes("noteSignal"), false);
  assert.match(app, /recallNotes/);
  assert.equal((app.match(/className="dot"/g) ?? []).length, 2);
  assert.equal(print.includes("Keepsakes"), false);

  assert.equal(noteNotesViewed(storage, [fresh]), true);
  assert.equal(frameHasUnseenNote(storage, [fresh]), false);
  const newer = note("cam", 190);
  assert.equal(frameHasUnseenNote(storage, [fresh, newer]), true);
  assert.equal(frameHasUnseenNote(storage, [note("me", 200, true)]), false);
});
