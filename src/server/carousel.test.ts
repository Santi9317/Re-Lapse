import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { cameraProof } from "@/server/quota";
import { createAlbum, filePhoto, readPublicProfile, saveOwnProfile } from "@/server/store";

const image = "a".repeat(120);

test("the strip only keeps shots that profile took, and galleries stay put", async () => {
  const ada = randomUUID();
  const bea = randomUUID();
  const adaId = randomUUID();
  const adaShot = randomUUID();
  const adaLater = randomUUID();
  const adaLab = randomUUID();
  const beaShot = randomUUID();
  const proof = await cameraProof(ada);

  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [ada]);
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [bea]);
  await sql(
    `insert into profiles (id, shooter_token, username, emoji_1, emoji_2, emoji_3, carousel)
     values ($1, $2, 'Ada', '📷', '✨', '🌈', '[]')`,
    [adaId, ada],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values
       ($1, $2, 'Ada first', $3, now() - interval '3 minutes', now(), now(), now() - interval '3 minutes'),
       ($4, $2, 'Ada later', $3, now() - interval '1 minute', now(), now(), now() - interval '1 minute'),
       ($5, $6, 'Bea frame', $3, now() - interval '2 minutes', now(), now(), now() - interval '2 minutes'),
       ($7, $2, 'Still in the lab', $3, now(), now(), now(), null)`,
    [adaShot, ada, image, adaLater, beaShot, bea, adaLab],
  );

  const gallery = await createAlbum("Sunday", ada, proof);
  await filePhoto(adaShot, ada, gallery.id);

  const saved = await saveOwnProfile(
    ada,
    {
      username: "Ada",
      emojis: ["📷", "✨", "🌈"],
      avatarPhotoId: null,
      avatarImageBase64: null,
      keepUpload: false,
      carouselIds: [beaShot, adaShot, adaLab, adaLater],
    },
    proof,
  );
  assert.deepEqual(saved.carouselIds, [adaShot, adaLater]);
  assert.equal(saved.galleries.length, 1);
  assert.equal(saved.galleries[0]?.name, "Sunday");
  assert.equal(saved.galleries[0]?.coverPhotoId, adaShot);

  const renamed = await saveOwnProfile(
    ada,
    {
      username: "Ada Lovelace",
      emojis: ["📷", "✨", "🌈"],
      avatarPhotoId: null,
      avatarImageBase64: null,
      keepUpload: true,
      carouselIds: [adaLater, beaShot],
    },
    proof,
  );
  assert.equal(renamed.username, "Ada Lovelace");
  assert.deepEqual(renamed.emojis, ["📷", "✨", "🌈"]);
  assert.deepEqual(renamed.carouselIds, [adaLater]);
  assert.equal(renamed.galleries[0]?.name, "Sunday");

  const guest = await readPublicProfile(adaId);
  assert.deepEqual(guest?.carouselIds, [adaLater]);
  assert.equal(guest?.galleries[0]?.name, "Sunday");

  const beaStill = await sql<{ id: string }>(`select id from photos where id = $1`, [beaShot]);
  assert.equal(beaStill[0]?.id, beaShot);
  const labStill = await sql<{ id: string; published_at: string | null }>(
    `select id, published_at from photos where id = $1`,
    [adaLab],
  );
  assert.equal(labStill[0]?.id, adaLab);
  assert.equal(labStill[0]?.published_at, null);
});
