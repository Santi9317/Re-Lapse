import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { setCaption } from "@/server/store";

const JPEG =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABAEBAQEAAAAAAAAAAAAAAAAAAAQFEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAIAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjAQNEAAAAAB//9k=";

test("a caption can be written only while that frame is being prepared for the feed", async () => {
  const owner = randomUUID();
  const other = randomUUID();
  const held = randomUUID();
  const shared = randomUUID();
  const waiting = randomUUID();
  const invite = randomUUID();
  const inviteHeld = randomUUID();
  const inviteShared = randomUUID();
  const opened = randomUUID();
  const openShot = randomUUID();
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [owner]);
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [other]);
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at)
     values ($1, $2, '', $3, now(), now(), now())`,
    [held, owner, JPEG],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values ($1, $2, '', $3, now(), now(), now(), now())`,
    [shared, owner, JPEG],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at)
     values ($1, $2, '', $3, now(), now())`,
    [waiting, owner, JPEG],
  );
  await sql(
    `insert into events (id, name, duration_hours, ends_at, reveal_at, owner_token, invite_only)
     values ($1, 'Picked roll', 1, now() - interval '5 hours', now() - interval '4 hours', $2, true)`,
    [invite, owner],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, developed_at)
     values ($1, $2, '', $3, $4, now() - interval '6 hours', now() - interval '5 hours', now() - interval '5 hours')`,
    [inviteHeld, owner, JPEG, invite],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, developed_at, published_at)
     values ($1, $2, '', $3, $4, now() - interval '6 hours', now() - interval '5 hours', now() - interval '5 hours', now())`,
    [inviteShared, owner, JPEG, invite],
  );
  await sql(
    `insert into events (id, name, duration_hours, ends_at, reveal_at, owner_token, invite_only)
     values ($1, 'Open roll', 1, now() - interval '3 hours', now() - interval '2 hours', $2, false)`,
    [opened, owner],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, developed_at)
     values ($1, $2, '', $3, $4, now() - interval '4 hours', now() - interval '3 hours', now() - interval '3 hours')`,
    [openShot, owner, JPEG, opened],
  );

  const saved = await setCaption(held, owner, "Night market");
  assert.equal(saved.caption, "Night market");
  const cleared = await setCaption(held, owner, "");
  assert.equal(cleared.caption, "");
  const again = await setCaption(held, owner, "Night market");
  assert.equal(again.caption, "Night market");

  const picked = await setCaption(inviteHeld, owner, "Before the pick");
  assert.equal(picked.caption, "Before the pick");

  await assert.rejects(setCaption(shared, owner, "After the feed"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "That caption is locked.");
    return true;
  });
  await assert.rejects(setCaption(inviteShared, owner, "Too late"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "That caption is locked.");
    return true;
  });
  await assert.rejects(setCaption(openShot, owner, "Already up"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "That caption is locked.");
    return true;
  });
  await assert.rejects(setCaption(waiting, owner, "Still developing"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "That frame isn't ready for a caption.");
    return true;
  });
  await assert.rejects(setCaption(held, other, "Not yours"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    return true;
  });
  await assert.rejects(setCaption(randomUUID(), owner, "Gone"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 404);
    return true;
  });

  const heldRow = await sql<{ caption: string }>(`select caption from photos where id = $1`, [held]);
  assert.equal(heldRow[0]?.caption, "Night market");
  const sharedRow = await sql<{ caption: string }>(`select caption from photos where id = $1`, [shared]);
  assert.equal(sharedRow[0]?.caption, "");
  const waitingRow = await sql<{ caption: string }>(`select caption from photos where id = $1`, [waiting]);
  assert.equal(waitingRow[0]?.caption, "");
  const openRow = await sql<{ caption: string }>(`select caption from photos where id = $1`, [openShot]);
  assert.equal(openRow[0]?.caption, "");
});
