import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { listFeed } from "@/server/store";

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
    `insert into events (id, name, duration_hours, ends_at, reveal_at, owner_token, invite_only)
     values ($1, 'Open roll', 1, now() - interval '3 hours', now() - interval '2 hours', $2, false)`,
    [openEvent, bea],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, developed_at)
     values ($1, $2, 'Opened', $3, $4, now() - interval '4 hours', now() - interval '3 hours', now() - interval '3 hours')`,
    [openShot, bea, image, openEvent],
  );
  await sql(
    `insert into events (id, name, duration_hours, ends_at, reveal_at, owner_token, invite_only)
     values ($1, 'Picked roll', 1, now() - interval '5 hours', now() - interval '4 hours', $2, true)`,
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
