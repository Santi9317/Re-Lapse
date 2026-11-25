import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { setCaption } from "@/server/store";

const JPEG =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABAEBAQEAAAAAAAAAAAAAAAAAAAQFEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAIAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjAQNEAAAAAB//9k=";

test("a caption sticks only after that frame is on the feed, and only for the person who shot it", async () => {
  const owner = randomUUID();
  const other = randomUUID();
  const held = randomUUID();
  const shared = randomUUID();
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

  await assert.rejects(setCaption(held, owner, "Too soon"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  await assert.rejects(setCaption(shared, other, "Not yours"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 403);
    return true;
  });
  await assert.rejects(setCaption(randomUUID(), owner, "Gone"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 404);
    return true;
  });

  const saved = await setCaption(shared, owner, "After the feed");
  assert.equal(saved.caption, "After the feed");
  const row = await sql<{ caption: string }>(`select caption from photos where id = $1`, [shared]);
  assert.equal(row[0]?.caption, "After the feed");
  const heldRow = await sql<{ caption: string }>(`select caption from photos where id = $1`, [held]);
  assert.equal(heldRow[0]?.caption, "");
});
