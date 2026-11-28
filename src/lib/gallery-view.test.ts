import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { galleryTitleSave, galleryView } from "./gallery-view.ts";

const albumId = "11111111-1111-4111-8111-111111111111";
const filed = { id: "filed", albumId };
const spare = { id: "spare", albumId: null };
const other = { id: "other", albumId: "22222222-2222-4222-8222-222222222222" };
const leaked = { id: "leaked", albumId: null };

test("a profile gallery shows only its photos, including for the owner", () => {
  const view = galleryView({
    place: "profile",
    owner: true,
    albumId,
    photos: [filed, leaked, spare],
    library: [filed, spare, other],
  });
  assert.equal(view.editing, false);
  assert.deepEqual(
    view.photos.map((photo) => photo.id),
    ["filed"],
  );
  assert.deepEqual(view.addable, []);
});

test("keepsakes still lets the owner add, and hides photos already in the gallery", () => {
  const view = galleryView({
    place: "keepsakes",
    owner: true,
    albumId,
    photos: [filed, leaked],
    library: [filed, spare, other],
  });
  assert.equal(view.editing, true);
  assert.deepEqual(
    view.photos.map((photo) => photo.id),
    ["filed"],
  );
  assert.deepEqual(
    view.addable.map((photo) => photo.id),
    ["spare", "other"],
  );
});

test("someone else cannot edit a gallery", () => {
  for (const place of ["profile", "keepsakes"] as const) {
    const view = galleryView({
      place,
      owner: false,
      albumId,
      photos: [filed, leaked],
      library: [spare, other],
    });
    assert.equal(view.editing, false);
    assert.deepEqual(
      view.photos.map((photo) => photo.id),
      ["filed"],
    );
    assert.deepEqual(view.addable, []);
  }
});

test("save stores a new title and leaves, and a blank title stays", () => {
  assert.deepEqual(galleryTitleSave("  Weekend  ", "Sunday"), { status: "write", name: "Weekend" });
  assert.deepEqual(galleryTitleSave("Sun   day", "Sunday"), { status: "write", name: "Sun day" });
  assert.deepEqual(galleryTitleSave("  Sunday \n", "Sunday"), { status: "leave" });
  assert.deepEqual(galleryTitleSave("   ", "Sunday"), { status: "stay", error: "Give it a short name." });
  assert.deepEqual(galleryTitleSave("x".repeat(41), "Sunday"), { status: "stay", error: "Give it a short name." });
  const gallery = readFileSync(new URL("../components/Gallery.tsx", import.meta.url), "utf8");
  assert.match(gallery, /galleryTitleSave\(title, detail\.album\.name\)/);
  assert.match(gallery, /if \(plan\.status === "write"\) await updateAlbum\(detail\.album\.id, \{ name: plan\.name \}\)/);
  assert.match(gallery, /onBack\(\)/);
  assert.match(gallery, /setError\(err instanceof Error \? err\.message : "That title stayed put\."\)/);
  assert.match(gallery, /data-save-gallery=\{detail\.album\.id\}/);
  assert.match(gallery, /\{busy \? "Saving…" : "Save"\}/);
  assert.equal(gallery.includes("title.trim() === detail.album.name"), false);
  const save = gallery.slice(gallery.indexOf("async function saveGallery"), gallery.indexOf("async function setCover"));
  const failure = save.slice(save.indexOf("} catch"));
  assert.equal(failure.includes("onBack"), false);
});

test("one photo can sit in two galleries, and the feed names no gallery", () => {
  const otherId = "22222222-2222-4222-8222-222222222222";
  const shared = { id: "shared", albumId, albumIds: [albumId, otherId] };
  const here = galleryView({ albumId, photos: [shared, leaked], library: [shared, spare, other] });
  const there = galleryView({ albumId: otherId, photos: [shared], library: [shared, spare, other] });
  assert.deepEqual(
    here.photos.map((photo) => photo.id),
    ["shared"],
  );
  assert.deepEqual(
    there.photos.map((photo) => photo.id),
    ["shared"],
  );
  assert.equal(
    here.addable.some((photo) => photo.id === "shared"),
    false,
  );
  assert.equal(
    there.addable.some((photo) => photo.id === "other"),
    false,
  );
  const print = readFileSync(new URL("../components/Print.tsx", import.meta.url), "utf8");
  const place = print.slice(print.lastIndexOf("function place("), print.lastIndexOf("function place(") + 160);
  assert.equal(place.includes("albumName"), false);
  assert.match(place, /eventName/);
});
