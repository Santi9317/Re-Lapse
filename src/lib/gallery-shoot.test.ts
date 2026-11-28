import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shotDestination } from "./gallery-shoot.ts";

const event = { id: "event", startsAt: 1_000, endsAt: 5_000 };
const gallery = "gallery";

test("an open timecapsule takes the frame, and a gallery session does not skip the lab", () => {
  assert.deepEqual(shotDestination(1_000, event, gallery), { eventId: "event", albumId: null });
  assert.deepEqual(shotDestination(4_999, event, gallery), { eventId: "event", albumId: null });
  assert.deepEqual(shotDestination(999, event, gallery), { eventId: null, albumId: gallery });
  assert.deepEqual(shotDestination(5_000, event, gallery), { eventId: null, albumId: gallery });
  assert.deepEqual(shotDestination(2_000, null, gallery), { eventId: null, albumId: gallery });
  assert.deepEqual(shotDestination(2_000, null, null), { eventId: null, albumId: null });
});

test("a gallery has a camera, Shoot marks that gallery with the same tape, and the frame still develops", () => {
  const galleryView = readFileSync(new URL("../components/Gallery.tsx", import.meta.url), "utf8");
  const shoot = readFileSync(new URL("../components/Shoot.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../components/App.tsx", import.meta.url), "utf8");
  const rolls = readFileSync(new URL("../components/Rolls.tsx", import.meta.url), "utf8");
  const profile = readFileSync(new URL("../components/Profile.tsx", import.meta.url), "utf8");

  assert.match(galleryView, /owner && onShoot/);
  assert.match(galleryView, /data-shoot-gallery=\{detail\.album\.id\}/);
  assert.match(galleryView, /aria-label=\{`Shoot for \$\{detail\.album\.name\}`\}/);
  assert.equal(galleryView.includes("data-shoot-gallery={id}"), false);

  assert.match(shoot, /shotDestination\(/);
  assert.match(shoot, /eventId: destination\.eventId/);
  assert.match(shoot, /albumId: destination\.albumId/);
  assert.match(shoot, /destination\.eventId != null[\s\S]*renderDisposable\([\s\S]*renderLatent\(bitmap\)/);
  assert.match(shoot, /data-gallery-roll=\{gallery\.id\}/);
  assert.match(shoot, /className="tape"/);
  assert.match(shoot, /aria-label="Stop shooting for this gallery"/);
  assert.match(shoot, /\{gallery\.name\} · gallery/);

  assert.match(app, /setGalleryRoll\(null\)/);
  assert.match(app, /setArmed\(null\)/);
  assert.match(app, /setGalleryRoll\(gallery\)/);
  assert.match(rolls, /onShoot=\{onShootGallery\}/);
  assert.match(profile, /onShoot=\{onShootGallery\}/);
});
