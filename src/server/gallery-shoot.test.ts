import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { cameraProof } from "@/server/quota";
import { createAlbum, createEvent, createPhoto, deleteAlbum, developPhoto, getAlbum, publishPhoto } from "@/server/store";

const JPEG =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABAEBAQEAAAAAAAAAAAAAAAAAAAQFEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAIAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjAQNEAAAAAB//9k=";

async function camera(token: string) {
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [token]);
}

async function membership(id: string) {
  const rows = await sql<{ album_id: string | null; for_album_id: string | null; developed_at: string | null; published_at: string | null; event_id: string | null }>(
    `select album_id, for_album_id, developed_at, published_at, event_id from photos where id = $1`,
    [id],
  );
  return rows[0];
}

test("a gallery shot waits in the lab, then joins that gallery when it is kept", async () => {
  const token = randomUUID();
  const proof = await cameraProof(token);
  await camera(token);
  const album = await createAlbum("Sunday", token, proof);

  const shot = await createPhoto({
    token,
    proof,
    caption: "",
    imageBase64: JPEG,
    eventId: null,
    albumId: album.id,
    dev: false,
    dateStamp: false,
    capturedAt: Date.now(),
  });
  assert.equal(shot.labState, "developing");
  assert.equal(shot.eventId, null);
  assert.ok(shot.readyAt - shot.createdAt >= 5 * 60 * 1000);
  assert.ok(shot.readyAt - shot.createdAt < 30 * 60 * 1000);

  const waiting = await membership(shot.id);
  assert.equal(waiting?.album_id, null);
  assert.equal(waiting?.for_album_id, album.id);
  assert.equal(waiting?.developed_at, null);
  assert.equal(waiting?.published_at, null);
  assert.equal((await getAlbum(album.id, token))?.photos.length, 0);
  assert.equal((await getAlbum(album.id, token))?.album.frameCount, 0);

  await assert.rejects(developPhoto(shot.id, token, { imageBase64: JPEG, chemistry: "default" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });

  await sql(`update photos set ready_at = now() - interval '1 minute' where id = $1`, [shot.id]);
  await developPhoto(shot.id, token, { imageBase64: JPEG, chemistry: "default" });
  const developed = await membership(shot.id);
  assert.equal(developed?.album_id, null);
  assert.equal(developed?.for_album_id, album.id);
  assert.ok(developed?.developed_at);
  assert.equal((await getAlbum(album.id, token))?.photos.some((photo) => photo.id === shot.id), false);

  await publishPhoto(shot.id, token);
  const kept = await membership(shot.id);
  assert.equal(kept?.album_id, album.id);
  assert.equal(kept?.for_album_id, null);
  assert.ok(kept?.published_at);
  const opened = await getAlbum(album.id, token);
  assert.deepEqual(
    opened?.photos.map((photo) => photo.id),
    [shot.id],
  );
  assert.equal(opened?.album.frameCount, 1);
});

test("a shot with no gallery, a missing gallery, or someone else's gallery is not filed early", async () => {
  const ada = randomUUID();
  const bea = randomUUID();
  const adaProof = await cameraProof(ada);
  await camera(ada);
  const album = await createAlbum("Ada", ada, adaProof);
  // A two-day-empty camera is reaped. Bea is issued just before the shot.
  await sql(`insert into cameras (token, created_at) values ($1, now())`, [bea]);
  const plain = await createPhoto({
    token: ada,
    proof: adaProof,
    caption: "",
    imageBase64: JPEG,
    eventId: null,
    dev: false,
    dateStamp: false,
    capturedAt: null,
  });
  assert.equal((await membership(plain.id))?.for_album_id, null);

  await assert.rejects(
    createPhoto({
      token: ada,
      proof: adaProof,
      caption: "",
      imageBase64: JPEG,
      eventId: null,
      albumId: randomUUID(),
      dev: false,
      dateStamp: false,
      capturedAt: null,
    }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "That gallery is gone.");
      return true;
    },
  );
  await assert.rejects(
    createPhoto({
      token: bea,
      proof: await cameraProof(bea),
      caption: "",
      imageBase64: JPEG,
      eventId: null,
      albumId: album.id,
      dev: false,
      dateStamp: false,
      capturedAt: null,
    }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 403);
      assert.equal(error.message, "Only the person who made this gallery can change it.");
      return true;
    },
  );
});

test("an open timecapsule does not also file the frame, and a deleted gallery is not joined later", async () => {
  const token = randomUUID();
  const proof = await cameraProof(token);
  await camera(token);
  const album = await createAlbum("Gone", token, proof);
  const live = await createEvent("Now", 4, false, token, proof, Date.now() - 30_000);
  const sealed = await createPhoto({
    token,
    proof,
    caption: "",
    imageBase64: JPEG,
    eventId: live.id,
    albumId: album.id,
    dev: false,
    dateStamp: false,
    capturedAt: Date.now(),
  });
  assert.equal(sealed.labState, "sealed");
  assert.equal(sealed.eventId, live.id);
  const onRoll = await membership(sealed.id);
  assert.equal(onRoll?.event_id, live.id);
  assert.equal(onRoll?.album_id, null);
  assert.equal(onRoll?.for_album_id, null);

  const shot = await createPhoto({
    token,
    proof,
    caption: "",
    imageBase64: JPEG,
    eventId: null,
    albumId: album.id,
    dev: true,
    dateStamp: false,
    capturedAt: Date.now(),
  });
  await deleteAlbum(album.id, token);
  await sql(`update photos set ready_at = now() - interval '1 minute' where id = $1`, [shot.id]);
  await developPhoto(shot.id, token, { imageBase64: JPEG, chemistry: "default" });
  await publishPhoto(shot.id, token);
  const kept = await membership(shot.id);
  assert.equal(kept?.album_id, null);
  assert.equal(kept?.for_album_id, null);
  assert.ok(kept?.published_at);
  assert.equal(await getAlbum(album.id, token), null);
});
