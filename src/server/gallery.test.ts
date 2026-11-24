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
     values ($1, $2, 'First', $3, now() - interval '2 minutes', now(), now(), now() - interval '2 minutes'),
            ($4, $2, 'Second', $3, now() - interval '1 minute', now(), now(), now() - interval '1 minute')`,
    [first, ada, image, second],
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
  assert.equal(opened?.library.length, 2);

  const asBea = await getAlbum(made.id, bea);
  assert.equal(asBea?.album.owner, false);
  assert.equal(asBea?.library.length, 0);
  assert.equal(asBea?.photos.length, 2);

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
