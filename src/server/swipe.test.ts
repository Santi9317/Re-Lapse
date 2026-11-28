import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { cameraProof } from "@/server/quota";
import {
  captionPostedPhoto,
  createAlbum,
  createPhoto,
  deletePhoto,
  developPhoto,
  discardPhoto,
  getAlbum,
  listFeed,
  listLab,
  publishPhoto,
  restorePhoto,
  unpublishPhoto,
} from "@/server/store";

const JPEG =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABAEBAQEAAAAAAAAAAAAAAAAAAAQFEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAIAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjAQNEAAAAAB//9k=";

async function camera(token: string) {
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [token]);
}

async function developed(token: string, proof: string, albumId?: string) {
  const shot = await createPhoto({
    token,
    proof,
    caption: "",
    imageBase64: JPEG,
    eventId: null,
    albumId: albumId ?? null,
    dev: false,
    dateStamp: false,
    capturedAt: Date.now(),
  });
  await sql(`update photos set ready_at = now() - interval '1 minute' where id = $1`, [shot.id]);
  await developPhoto(shot.id, token, { imageBase64: JPEG, chemistry: "default" });
  return shot.id;
}

test("a left swipe leaves the darkroom, and undo puts that photo back", async () => {
  const token = randomUUID();
  const proof = await cameraProof(token);
  await camera(token);
  const id = await developed(token, proof);

  await discardPhoto(id, token);
  await discardPhoto(id, token);
  assert.equal((await listLab(token)).some((photo) => photo.id === id), false);

  await restorePhoto(id, token);
  const back = (await listLab(token)).find((photo) => photo.id === id);
  assert.equal(back?.labState, "developed");

  await discardPhoto(id, token);
  await deletePhoto(id, token);
  assert.equal((await listLab(token)).some((photo) => photo.id === id), false);
  await assert.rejects(restorePhoto(id, token), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 404);
    return true;
  });
});

test("a right swipe posts to the feed, and undo brings it back to the darkroom", async () => {
  const token = randomUUID();
  const proof = await cameraProof(token);
  await camera(token);
  const id = await developed(token, proof);

  await publishPhoto(id, token);
  assert.equal((await listLab(token)).some((photo) => photo.id === id), false);
  assert.equal((await listFeed(token)).some((photo) => photo.id === id), true);

  const saved = await captionPostedPhoto(id, token, "Night market");
  assert.equal(saved.caption, "Night market");

  await unpublishPhoto(id, token);
  assert.equal((await listFeed(token)).some((photo) => photo.id === id), false);
  const back = (await listLab(token)).find((photo) => photo.id === id);
  assert.equal(back?.labState, "developed");
  assert.equal(back?.caption, "Night market");
  await unpublishPhoto(id, token);
});

test("undo of a gallery post files it back where it was waiting", async () => {
  const token = randomUUID();
  const proof = await cameraProof(token);
  await camera(token);
  const album = await createAlbum("Sunday", token, proof);
  const id = await developed(token, proof, album.id);

  await publishPhoto(id, token);
  assert.equal((await getAlbum(album.id, token))?.photos.some((photo) => photo.id === id), true);

  await unpublishPhoto(id, token);
  const row = await sql<{ album_id: string | null; for_album_id: string | null; published_at: string | null }>(
    `select album_id, for_album_id, published_at from photos where id = $1`,
    [id],
  );
  assert.equal(row[0]?.album_id, null);
  assert.equal(row[0]?.for_album_id, album.id);
  assert.equal(row[0]?.published_at, null);
  assert.equal((await getAlbum(album.id, token))?.photos.some((photo) => photo.id === id), false);
  assert.equal((await listLab(token)).some((photo) => photo.id === id), true);
});

test("a left swipe closes the older publish route until undo", async () => {
  const owner = randomUUID();
  const other = randomUUID();
  const proof = await cameraProof(owner);
  await camera(owner);
  await camera(other);
  const album = await createAlbum("Sunday", owner, proof);
  const id = await developed(owner, proof, album.id);

  await discardPhoto(id, owner);
  await assert.rejects(publishPhoto(id, owner), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  await assert.rejects(publishPhoto(id, other), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  assert.equal((await listFeed(owner)).some((photo) => photo.id === id), false);
  assert.equal((await listLab(owner)).some((photo) => photo.id === id), false);
  assert.equal((await getAlbum(album.id, owner))?.photos.some((photo) => photo.id === id), false);
  const held = await sql<{ published_at: string | null; discarded_at: string | null }>(
    `select published_at, discarded_at from photos where id = $1`,
    [id],
  );
  assert.equal(held[0]?.published_at, null);
  assert.ok(held[0]?.discarded_at);

  await restorePhoto(id, owner);
  await publishPhoto(id, owner);
  assert.equal((await listFeed(owner)).some((photo) => photo.id === id), true);
  assert.equal((await getAlbum(album.id, owner))?.photos.some((photo) => photo.id === id), true);
});

test("a fresh caption locks after the post settles, and only the shooter can take the swipe back", async () => {
  const owner = randomUUID();
  const other = randomUUID();
  const proof = await cameraProof(owner);
  await camera(owner);
  await camera(other);
  const id = await developed(owner, proof);
  await publishPhoto(id, owner);
  await sql(`update photos set published_at = now() - interval '2 hours' where id = $1`, [id]);

  await assert.rejects(captionPostedPhoto(id, owner, "Too late"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "That caption is locked.");
    return true;
  });
  await assert.rejects(unpublishPhoto(id, other), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    return true;
  });
  await assert.rejects(discardPhoto(id, other), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    return true;
  });
  await assert.rejects(discardPhoto(id, owner), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
});
