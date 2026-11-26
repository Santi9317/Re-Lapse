import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { listFeed, setSticker } from "@/server/store";

const image = "a".repeat(120);

test("a feed frame is new from when it was added, and a frame this camera took is its own", async () => {
  const ada = randomUUID();
  const bea = randomUUID();
  const adaShot = randomUUID();
  const beaShot = randomUUID();
  const openEvent = randomUUID();
  const openShot = randomUUID();
  const pickedEvent = randomUUID();
  const pickedShot = randomUUID();

  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [ada]);
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [bea]);
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values
       ($1, $2, 'Ada', $3, now() - interval '30 minutes', now(), now(), now() - interval '20 minutes'),
       ($4, $5, 'Bea', $3, now() - interval '30 minutes', now(), now(), now() - interval '10 minutes')`,
    [adaShot, ada, image, beaShot, bea],
  );
  await sql(
    `insert into events (id, name, duration_hours, starts_at, ends_at, reveal_at, owner_token, invite_only)
     values ($1, 'Open roll', 1, now() - interval '4 hours', now() - interval '3 hours', now() - interval '2 hours', $2, false)`,
    [openEvent, bea],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, developed_at)
     values ($1, $2, 'Opened', $3, $4, now() - interval '4 hours', now() - interval '3 hours', now() - interval '3 hours')`,
    [openShot, bea, image, openEvent],
  );
  await sql(
    `insert into events (id, name, duration_hours, starts_at, ends_at, reveal_at, owner_token, invite_only)
     values ($1, 'Picked roll', 1, now() - interval '6 hours', now() - interval '5 hours', now() - interval '4 hours', $2, true)`,
    [pickedEvent, bea],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, developed_at, published_at)
     values ($1, $2, 'Picked', $3, $4, now() - interval '6 hours', now() - interval '5 hours', now() - interval '5 hours', now() - interval '5 minutes')`,
    [pickedShot, bea, image, pickedEvent],
  );

  const feed = await listFeed(ada);
  const mine = feed.find((item) => item.id === adaShot);
  const theirs = feed.find((item) => item.id === beaShot);
  const opened = feed.find((item) => item.id === openShot);
  const picked = feed.find((item) => item.id === pickedShot);

  assert.equal(mine?.mine, true);
  assert.equal(theirs?.mine, false);
  assert.ok(mine && Math.abs(mine.addedAt - mine.sortAt) < 1_500);
  assert.ok(theirs && Math.abs(theirs.addedAt - theirs.sortAt) < 1_500);
  assert.ok(opened && Math.abs(opened.addedAt - opened.sortAt) < 1_500);
  assert.ok(picked && picked.addedAt > picked.sortAt + 60 * 60 * 1000);
  assert.equal(opened?.mine, false);
  assert.equal(picked?.mine, false);
});

test("a sticker's pin time moves when the emoji changes, and stays when it does not", async () => {
  const ada = randomUUID();
  const bea = randomUUID();
  const adaId = randomUUID();
  const beaId = randomUUID();
  const beaPhoto = randomUUID();
  const image = "a".repeat(120);

  for (const [token, id, name] of [
    [ada, adaId, "Ada"],
    [bea, beaId, "Bea"],
  ] as const) {
    await sql(`insert into cameras (token, created_at) values ($1, now())`, [token]);
    await sql(
      `insert into profiles (id, shooter_token, username, emoji_1, emoji_2, emoji_3, carousel)
       values ($1, $2, $3, '📷', '✨', '🌈', '[]')`,
      [id, token, name],
    );
  }
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values ($1, $2, 'Bea frame', $3, now(), now(), now(), now())`,
    [beaPhoto, bea, image],
  );

  const first = await setSticker(beaPhoto, ada, "✨");
  const stuck = first.find((sticker) => sticker.mine);
  assert.equal(stuck?.emoji, "✨");
  assert.ok(stuck && stuck.pinnedAt > Date.now() - 60_000 && stuck.pinnedAt < Date.now() + 60_000);

  await sql(
    `update stickers set updated_at = now() - interval '2 hours' where photo_id = $1 and shooter_token = $2`,
    [beaPhoto, ada],
  );
  const same = await setSticker(beaPhoto, ada, "✨");
  const held = same.find((sticker) => sticker.mine);
  assert.equal(held?.emoji, "✨");
  assert.ok(held && held.pinnedAt < Date.now() - 60 * 60 * 1000);

  const changed = await setSticker(beaPhoto, ada, "🌙");
  const fresh = changed.find((sticker) => sticker.mine);
  assert.equal(fresh?.emoji, "🌙");
  assert.ok(fresh && fresh.pinnedAt > Date.now() - 60_000);

  const feed = await listFeed(bea);
  const onBea = feed.find((item) => item.id === beaPhoto)?.stickers.find((sticker) => sticker.profileId === adaId);
  assert.equal(onBea?.mine, false);
  assert.equal(onBea?.emoji, "🌙");
  assert.ok(onBea && fresh && Math.abs(onBea.pinnedAt - fresh.pinnedAt) < 1_500);
});
