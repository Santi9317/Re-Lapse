import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PUT as savePinRoute } from "@/app/api/profile/pin/route";
import { PUT as saveProfileRoute } from "@/app/api/profile/route";
import { sql } from "@/lib/db";
import { cameraProof } from "@/server/quota";
import { createAlbum } from "@/server/store";

const IMAGE = "b".repeat(140);

function cameraRequest(path: string, token: string, proof: string, body: unknown): Request {
  return new Request(`http://127.0.0.1${path}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      cookie: `relapse_auth=${token}.${proof}`,
    },
    body: JSON.stringify(body),
  });
}

test("shots taken before a profile stay attached when it is saved and later edited", async () => {
  const token = randomUUID();
  const other = randomUUID();
  const shared = randomUUID();
  const lab = randomUUID();
  const fresh = randomUUID();
  const sealed = randomUUID();
  const album = randomUUID();
  const event = randomUUID();
  const proof = await cameraProof(token);

  await sql(`insert into cameras (token, created_at) values ($1, now())`, [token]);
  await sql(
    `insert into join_requests (id, camera_token, display_name, status) values ($1, $2, 'Ada', 'accepted')`,
    [randomUUID(), token],
  );
  await sql(`insert into albums (id, name, owner_token) values ($1, 'Pocket', $2)`, [album, token]);
  await sql(
    `insert into events (id, name, duration_hours, ends_at, reveal_at, owner_token, invite_only)
     values ($1, 'Night roll', 8, now() + interval '8 hours', now() + interval '32 hours', $2, true)`,
    [event, token],
  );
  await sql(
    `insert into event_members (event_id, shooter_token) values ($1, $2)`,
    [event, token],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, album_id, created_at, ready_at, developed_at, published_at)
     values ($1, $2, 'On the feed', $3, $4, now(), now(), now(), now())`,
    [shared, token, IMAGE, album],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values ($1, $2, 'Before the name', $3, now() - interval '3 hours', now() - interval '3 hours', now() - interval '2 hours', null)`,
    [lab, token, IMAGE],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at)
     values ($1, $2, 'Still winding', $3, now(), now() + interval '10 minutes')`,
    [fresh, token, IMAGE],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at)
     values ($1, $2, 'Sealed', $3, $4, now(), now() + interval '8 hours')`,
    [sealed, token, IMAGE, event],
  );
  await sql(
    `insert into stickers (photo_id, shooter_token, emoji) values ($1, $2, '🌙')`,
    [shared, token],
  );

  const pin = await savePinRoute(cameraRequest("/api/profile/pin", token, proof, { pin: "048213" }));
  assert.equal(pin.status, 200);

  // The lab photo is unpublished and older than two hours on a day-one camera.
  // Saving the profile used to reap those shots before the profile row existed.
  const created = await saveProfileRoute(
    cameraRequest("/api/profile", token, proof, {
      username: "Ada",
      emojis: ["📷", "✨", "🌈"],
      avatarPhotoId: shared,
    }),
  );
  assert.equal(created.status, 200);
  const profile = (await created.json()) as {
    id: string;
    username: string;
    emojis: string[];
    avatarPhotoId: string | null;
    carouselIds: string[];
  };
  assert.equal(profile.username, "Ada");
  assert.deepEqual(profile.emojis, ["📷", "✨", "🌈"]);
  assert.equal(profile.avatarPhotoId, shared);
  assert.equal(profile.carouselIds.includes(shared), true);
  assert.equal(profile.carouselIds.includes(lab), true);
  assert.equal(profile.carouselIds.includes(fresh), false);
  assert.equal(profile.carouselIds.includes(sealed), false);

  const pins = await sql<{ camera_pin: string | null; profile_pin: string | null }>(
    `select c.pin_hash as camera_pin, p.pin_hash as profile_pin
     from cameras c
     join profiles p on p.shooter_token = c.token
     where c.token = $1`,
    [token],
  );
  assert.equal(typeof pins[0]?.camera_pin, "string");
  assert.equal(pins[0]?.profile_pin, pins[0]?.camera_pin);
  const pinHash = String(pins[0]?.profile_pin);

  const control = randomUUID();
  const controlPhoto = randomUUID();
  await sql(`insert into cameras (token, created_at) values ($1, now())`, [control]);
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at)
     values ($1, $2, 'Unclaimed', $3, now() - interval '3 hours', now() - interval '3 hours')`,
    [controlPhoto, control, IMAGE],
  );
  await createAlbum("Spare", token, proof);

  const kept = await sql<{ id: string; caption: string; shooter_token: string; album_id: string | null; event_id: string | null }>(
    `select id, caption, shooter_token, album_id, event_id from photos where shooter_token = $1 order by caption`,
    [token],
  );
  assert.deepEqual(
    kept.map((row) => row.caption).sort(),
    ["Before the name", "On the feed", "Sealed", "Still winding"],
  );
  for (const row of kept) assert.equal(row.shooter_token, token);
  assert.equal(kept.find((row) => row.id === shared)?.album_id, album);
  assert.equal(kept.find((row) => row.id === sealed)?.event_id, event);
  const gone = await sql<{ id: string }>(`select id from photos where id = $1`, [controlPhoto]);
  assert.equal(gone.length, 0);

  const renamed = await saveProfileRoute(
    cameraRequest("/api/profile", token, proof, { username: "Ada Lovelace" }),
  );
  assert.equal(renamed.status, 200);
  const after = (await renamed.json()) as typeof profile;
  assert.equal(after.id, profile.id);
  assert.equal(after.username, "Ada Lovelace");
  assert.deepEqual(after.emojis, ["📷", "✨", "🌈"]);
  assert.equal(after.avatarPhotoId, shared);
  assert.deepEqual(after.carouselIds, profile.carouselIds);

  const pinsAfter = await sql<{ camera_pin: string | null; profile_pin: string | null }>(
    `select c.pin_hash as camera_pin, p.pin_hash as profile_pin
     from cameras c join profiles p on p.shooter_token = c.token where c.token = $1`,
    [token],
  );
  assert.equal(pinsAfter[0]?.profile_pin, pinHash);
  assert.equal(pinsAfter[0]?.camera_pin, pinHash);

  const still = await sql<{ id: string; caption: string; shooter_token: string }>(
    `select id, caption, shooter_token from photos where id = any($1::text[])`,
    [[shared, lab, fresh, sealed]],
  );
  assert.equal(still.length, 4);
  assert.equal(still.find((row) => row.id === lab)?.caption, "Before the name");
  for (const row of still) assert.equal(row.shooter_token, token);

  const roll = await sql<{ id: string; owner_token: string }>(
    `select id, owner_token from albums where id = $1`,
    [album],
  );
  assert.equal(roll[0]?.owner_token, token);
  const night = await sql<{ id: string; owner_token: string }>(
    `select id, owner_token from events where id = $1`,
    [event],
  );
  assert.equal(night[0]?.owner_token, token);
  const member = await sql<{ shooter_token: string }>(
    `select shooter_token from event_members where event_id = $1`,
    [event],
  );
  assert.equal(member[0]?.shooter_token, token);
  const sticker = await sql<{ emoji: string; shooter_token: string }>(
    `select emoji, shooter_token from stickers where photo_id = $1`,
    [shared],
  );
  assert.equal(sticker[0]?.emoji, "🌙");
  assert.equal(sticker[0]?.shooter_token, token);
});
