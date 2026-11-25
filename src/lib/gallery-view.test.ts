import assert from "node:assert/strict";
import test from "node:test";
import { galleryView } from "./gallery-view.ts";

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
