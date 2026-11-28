import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { cameraProof } from "@/server/quota";
import { HttpError } from "@/server/http";
import { createAlbum, deleteAlbum, filePhoto, getAlbum, listAlbums, readPublicProfile, updateAlbum } from "@/server/store";

const image = "a".repeat(120);

async function camera(token: string) {
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [token]);
}

test("a gallery is the owner's photos, with a cover, and delete keeps those photos", async () => {
  const ada = randomUUID();
  const bea = randomUUID();
  const adaId = randomUUID();
  const first = randomUUID();
  const second = randomUUID();
  const spare = randomUUID();
  const beaShot = randomUUID();
  const proof = await cameraProof(ada);
  await camera(ada);
  await camera(bea);
  await sql(
    `insert into profiles (id, shooter_token, username, emoji_1, emoji_2, emoji_3, carousel)
     values ($1, $2, 'Ada', '📷', '✨', '🌈', '[]')`,
    [adaId, ada],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values ($1, $2, 'First', $3, now() - interval '4 minutes', now(), now(), now() - interval '4 minutes'),
            ($4, $2, 'Second', $3, now() - interval '3 minutes', now(), now(), now() - interval '3 minutes'),
            ($5, $2, 'Spare', $3, now() - interval '2 minutes', now(), now(), now() - interval '2 minutes'),
            ($6, $7, 'Bea', $3, now() - interval '1 minute', now(), now(), now() - interval '1 minute')`,
    [first, ada, image, second, spare, beaShot, bea],
  );

  const made = await createAlbum("Sunday", ada, proof);
  assert.equal(made.owner, true);
  assert.equal(made.coverPhotoId, null);
  await filePhoto(first, ada, made.id);
  await filePhoto(second, ada, made.id);

  const opened = await getAlbum(made.id, ada);
  assert.equal(opened?.album.owner, true);
  assert.equal(opened?.album.coverPhotoId, first);
  assert.deepEqual(
    opened?.photos.map((photo) => photo.id),
    [first, second],
  );
  assert.equal(opened?.photos.some((photo) => photo.id === spare), false);
  assert.equal(opened?.photos.every((photo) => photo.albumId === made.id), true);
  assert.equal(opened?.library.length, 3);
  assert.equal(opened?.library.some((photo) => photo.id === spare), true);

  const asBea = await getAlbum(made.id, bea);
  assert.equal(asBea?.album.owner, false);
  assert.equal(asBea?.library.length, 0);
  assert.deepEqual(
    asBea?.photos.map((photo) => photo.id),
    [first, second],
  );
  assert.equal(asBea?.photos.some((photo) => photo.id === beaShot || photo.id === spare), false);

  await assert.rejects(updateAlbum(made.id, bea, { name: "Nope" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    return true;
  });
  await assert.rejects(deleteAlbum(made.id, bea), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    return true;
  });

  const renamed = await updateAlbum(made.id, ada, { name: "Weekend", coverPhotoId: second });
  assert.equal(renamed.name, "Weekend");
  assert.equal(renamed.coverPhotoId, second);

  const onProfile = await readPublicProfile(adaId);
  assert.equal(onProfile?.galleries.length, 1);
  assert.equal(onProfile?.galleries[0]?.name, "Weekend");
  assert.equal(onProfile?.galleries[0]?.coverPhotoId, second);
  assert.equal((await listAlbums(ada)).length >= 1, true);
  assert.equal((await listAlbums(bea)).some((album) => album.id === made.id), false);

  await filePhoto(second, ada, null);
  const afterRemove = await getAlbum(made.id, ada);
  assert.equal(afterRemove?.photos.some((photo) => photo.id === second), false);
  assert.equal(afterRemove?.album.coverPhotoId, first);

  await deleteAlbum(made.id, ada);
  const still = await sql<{ id: string; album_id: string | null }>(
    `select id, album_id from photos where id = $1`,
    [first],
  );
  assert.equal(still[0]?.id, first);
  assert.equal(still[0]?.album_id, null);
  assert.equal(await getAlbum(made.id, ada), null);
  assert.equal((await readPublicProfile(adaId))?.galleries.length, 0);
});

test("adding a photo to a second gallery leaves it in the first", async () => {
  const ada = randomUUID();
  const adaId = randomUUID();
  const shot = randomUUID();
  const proof = await cameraProof(ada);
  await camera(ada);
  await sql(
    `insert into profiles (id, shooter_token, username, emoji_1, emoji_2, emoji_3, carousel)
     values ($1, $2, 'Ada', '📷', '✨', '🌈', '[]')`,
    [adaId, ada],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values ($1, $2, 'Shared', $3, now() - interval '4 minutes', now(), now(), now() - interval '4 minutes')`,
    [shot, ada, image],
  );
  const first = await createAlbum("Sunday", ada, proof);
  const second = await createAlbum("Monday", ada, proof);
  await filePhoto(shot, ada, first.id);
  await filePhoto(shot, ada, second.id);

  const sunday = await getAlbum(first.id, ada);
  const monday = await getAlbum(second.id, ada);
  assert.equal(sunday?.photos.some((photo) => photo.id === shot), true);
  assert.equal(monday?.photos.some((photo) => photo.id === shot), true);
  assert.equal(sunday?.photos.find((photo) => photo.id === shot)?.albumId, first.id);
  const ids = sunday?.photos.find((photo) => photo.id === shot)?.albumIds ?? [];
  assert.equal(ids.includes(first.id), true);
  assert.equal(ids.includes(second.id), true);
  assert.equal(sunday?.album.frameCount, 1);
  assert.equal(monday?.album.frameCount, 1);

  await filePhoto(shot, ada, second.id, true);
  const stillSunday = await getAlbum(first.id, ada);
  const afterMonday = await getAlbum(second.id, ada);
  assert.equal(stillSunday?.photos.some((photo) => photo.id === shot), true);
  assert.equal(afterMonday?.photos.some((photo) => photo.id === shot), false);
  const row = await sql<{ album_id: string | null }>(`select album_id from photos where id = $1`, [shot]);
  assert.equal(row[0]?.album_id, first.id);
});
