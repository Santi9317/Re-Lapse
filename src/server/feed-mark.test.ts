import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { listFeed, moveSticker, removeSticker, setSticker } from "@/server/store";

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

test("another emoji stays beside the ones already on the frame", async () => {
  const ada = randomUUID();
  const bea = randomUUID();
  const adaId = randomUUID();
  const beaId = randomUUID();
  const beaPhoto = randomUUID();
  const adaPhoto = randomUUID();
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
     values ($1, $2, 'Bea frame', $3, now(), now(), now(), now()),
            ($4, $5, 'Ada frame', $3, now(), now(), now(), now())`,
    [beaPhoto, bea, image, adaPhoto, ada],
  );

  const first = await setSticker(beaPhoto, ada, "✨");
  const stuck = first.find((sticker) => sticker.mine);
  assert.equal(stuck?.emoji, "✨");
  assert.ok(stuck && stuck.pinnedAt > Date.now() - 60_000 && stuck.pinnedAt < Date.now() + 60_000);

  await sql(`update stickers set updated_at = now() - interval '2 hours' where id = $1`, [stuck?.id]);
  const again = await setSticker(beaPhoto, ada, "✨");
  const mine = again.filter((sticker) => sticker.mine);
  assert.equal(mine.length, 2);
  const held = mine.find((sticker) => sticker.id === stuck?.id);
  const added = mine.find((sticker) => sticker.id !== stuck?.id);
  assert.equal(held?.emoji, "✨");
  assert.equal(added?.emoji, "✨");
  assert.ok(held && held.pinnedAt < Date.now() - 60 * 60 * 1000);
  assert.ok(added && added.pinnedAt > Date.now() - 60_000);
  assert.ok(held && added && (held.x !== added.x || held.y !== added.y));

  const third = await setSticker(beaPhoto, ada, "🌙");
  assert.equal(third.filter((sticker) => sticker.mine).length, 3);
  const moon = third.find((sticker) => sticker.emoji === "🌙");
  assert.ok(moon);

  const moved = await moveSticker(beaPhoto, bea, added?.id ?? "", 40, 62);
  const shifted = moved.find((sticker) => sticker.id === added?.id);
  assert.equal(shifted?.x, 40);
  assert.equal(shifted?.y, 62);
  assert.equal(shifted?.mine, false);
  assert.ok(shifted && added && Math.abs(shifted.pinnedAt - added.pinnedAt) < 1_500);

  await assert.rejects(
    () => removeSticker(beaPhoto, bea, held?.id ?? ""),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
  const own = await setSticker(adaPhoto, ada, "🔥");
  const fire = own.find((sticker) => sticker.emoji === "🔥");
  assert.equal(fire?.mine, true);
  const peeled = await removeSticker(beaPhoto, ada, added?.id ?? "");
  assert.equal(peeled.some((sticker) => sticker.id === added?.id), false);
  assert.equal(peeled.filter((sticker) => sticker.mine).length, 2);

  const feed = await listFeed(bea);
  const onBea = feed.find((item) => item.id === beaPhoto)?.stickers ?? [];
  assert.equal(onBea.length, 2);
  assert.equal(onBea.every((sticker) => sticker.profileId === adaId && sticker.mine === false), true);
  assert.equal(onBea.some((sticker) => sticker.emoji === "✨"), true);
  assert.equal(onBea.some((sticker) => sticker.emoji === "🌙"), true);
  const parked = onBea.find((sticker) => sticker.id === moon?.id);
  assert.ok(parked && moon && Math.abs(parked.pinnedAt - moon.pinnedAt) < 1_500);

  const cam = randomUUID();
  const camId = randomUUID();
  await sql(`insert into cameras (token, created_at) values ($1, now())`, [cam]);
  await sql(
    `insert into profiles (id, shooter_token, username, emoji_1, emoji_2, emoji_3, carousel)
     values ($1, $2, 'Cam', '📷', '✨', '🌈', '[]')`,
    [camId, cam],
  );
  await assert.rejects(
    () => moveSticker(beaPhoto, cam, moon?.id ?? "", 20, 30),
    (err: unknown) => err instanceof HttpError && err.status === 403,
  );
  const byPlacer = await moveSticker(beaPhoto, ada, moon?.id ?? "", 22, 30);
  assert.equal(byPlacer.find((sticker) => sticker.id === moon?.id)?.x, 22);

  const nudgedOwn = await moveSticker(adaPhoto, ada, fire?.id ?? "", 18, 70);
  assert.equal(nudgedOwn.find((sticker) => sticker.id === fire?.id)?.x, 18);
  assert.equal(nudgedOwn.find((sticker) => sticker.id === fire?.id)?.y, 70);
  await assert.rejects(
    () => moveSticker(adaPhoto, bea, fire?.id ?? "", 30, 40),
    (err: unknown) => err instanceof HttpError && err.status === 403,
  );
  await assert.rejects(
    () => moveSticker(adaPhoto, cam, fire?.id ?? "", 30, 40),
    (err: unknown) => err instanceof HttpError && err.status === 403,
  );
});
