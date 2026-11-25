import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { CAPSULE_SEAL_MS, EVENT_START_AHEAD_MS, EVENT_START_SKEW_MS } from "@/lib/clock";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { cameraProof } from "@/server/quota";
import { createEvent, createPhoto, getEvent, listEvents } from "@/server/store";
import { cleanStart } from "@/server/validate";

const JPEG =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABAEBAQEAAAAAAAAAAAAAAAAAAAQFEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAIAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjAQNEAAAAAB//9k=";

function rejectsStart(value: unknown, now: number, message: string) {
  assert.throws(
    () => cleanStart(value, now),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      assert.equal(error.message, message);
      return true;
    },
  );
}

test("a start is now through the next year", () => {
  const now = 1_700_000_000_000;
  assert.equal(cleanStart(now + 5_000, now), now + 5_000);
  assert.equal(cleanStart(now - 30_000, now), now);
  assert.equal(cleanStart(now, now), now);
  assert.equal(cleanStart(now + EVENT_START_AHEAD_MS, now), now + EVENT_START_AHEAD_MS);
  rejectsStart(undefined, now, "Pick when the timecapsule opens.");
  rejectsStart("soon", now, "Pick when the timecapsule opens.");
  rejectsStart(Number.NaN, now, "Pick when the timecapsule opens.");
  rejectsStart(now - EVENT_START_SKEW_MS - 1, now, "Pick a start from now on.");
  rejectsStart(now + EVENT_START_AHEAD_MS + 1, now, "Pick a start within the next year.");
});

test("the open hours run from the chosen start, and the frames stay hidden for a day after", async () => {
  const token = randomUUID();
  const proof = await cameraProof(token);
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [token]);

  const start = Date.now() + 2 * 60 * 60 * 1000;
  const later = await createEvent("Later", 3, false, token, proof, start);
  assert.equal(later.status, "waiting");
  assert.ok(Math.abs(later.startsAt - start) < 20, `start ${later.startsAt} vs ${start}`);
  assert.ok(Math.abs(later.endsAt - (later.startsAt + 3 * 3_600_000)) < 20);
  assert.ok(Math.abs(later.revealAt - (later.endsAt + CAPSULE_SEAL_MS)) < 20);

  const before = Date.now();
  const live = await createEvent("Now", 4, false, token, proof, before - 30_000);
  const after = Date.now();
  assert.equal(live.status, "open");
  assert.ok(live.startsAt >= before && live.startsAt <= after);
  assert.ok(Math.abs(live.endsAt - (live.startsAt + 4 * 3_600_000)) < 20);
  assert.ok(Math.abs(live.revealAt - (live.endsAt + CAPSULE_SEAL_MS)) < 20);

  const hidden = randomUUID();
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at)
     values ($1, $2, 'Early', $3, $4, now(), now() + interval '1 day')`,
    [hidden, token, "b".repeat(140), later.id],
  );
  const waiting = await getEvent(later.id, token);
  assert.equal(waiting?.status, "waiting");
  assert.equal(waiting?.photos.length, 0);
  assert.equal(waiting?.frameCount, null);

  await assert.rejects(
    createPhoto({
      token,
      proof,
      caption: "",
      imageBase64: JPEG,
      eventId: later.id,
      dev: false,
      dateStamp: false,
      capturedAt: Date.now(),
    }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "This timecapsule isn't open yet.");
      return true;
    },
  );

  const shot = await createPhoto({
    token,
    proof,
    caption: "",
    imageBase64: JPEG,
    eventId: live.id,
    dev: false,
    dateStamp: false,
    capturedAt: Date.now(),
  });
  assert.equal(shot.eventId, live.id);
  assert.equal(shot.labState, "sealed");
  const stillHidden = await getEvent(live.id, token);
  assert.equal(stillHidden?.status, "open");
  assert.equal(stillHidden?.photos.length, 0);

  const sealing = randomUUID();
  const ready = randomUUID();
  const kept = randomUUID();
  await sql(
    `insert into events (id, name, duration_hours, starts_at, ends_at, reveal_at, owner_token, invite_only)
     values
       ($1, 'Sealing', 1, now() - interval '2 hours', now() - interval '1 hour', now() + interval '23 hours', $3, true),
       ($2, 'Ready', 1, now() - interval '26 hours', now() - interval '25 hours', now() - interval '1 hour', $3, true)`,
    [sealing, ready, token],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, developed_at)
     values ($1, $2, 'Back', $3, $4, now() - interval '26 hours', now() - interval '25 hours', now() - interval '25 hours')`,
    [kept, token, "c".repeat(140), ready],
  );

  await assert.rejects(
    createPhoto({
      token,
      proof,
      caption: "",
      imageBase64: JPEG,
      eventId: sealing,
      dev: false,
      dateStamp: false,
      capturedAt: Date.now(),
    }),
    (error: unknown) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 409);
      assert.equal(error.message, "This timecapsule is closed.");
      return true;
    },
  );

  const listed = await listEvents(token);
  const byId = new Map(listed.map((event) => [event.id, event]));
  assert.equal(byId.get(later.id)?.status, "waiting");
  assert.equal(byId.get(live.id)?.status, "open");
  assert.equal(byId.get(sealing)?.status, "sealing");
  assert.equal(byId.get(ready)?.status, "ready");
  assert.equal(byId.get(later.id)?.frameCount, null);
  assert.equal(byId.get(ready)?.frameCount, 1);

  const back = await getEvent(ready, token);
  assert.equal(back?.status, "ready");
  assert.deepEqual(
    back?.photos.map((photo) => photo.id),
    [kept],
  );
});
