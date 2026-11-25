import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { chooseChemistry, developPhoto, readLatent } from "@/server/store";
import { readChemistryChoice } from "@/server/validate";

const JPEG =
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABAEBAQEAAAAAAAAAAAAAAAAAAAQFEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgAIAAgAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjAQNEAAAAAB//9k=";

async function camera(token: string) {
  await sql(`insert into cameras (token, created_at) values ($1, now() - interval '2 days')`, [token]);
}

test("a bath is chosen while the clock runs and the print is graded once", async () => {
  const token = randomUUID();
  await camera(token);
  const waiting = randomUUID();
  const ready = randomUUID();
  const plain = randomUUID();
  const legacy = randomUUID();
  const eventId = randomUUID();
  const sealed = randomUUID();
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, graded, date_stamp)
     values
       ($1, $2, 'Wait', $3, now(), now() + interval '1 hour', false, true),
       ($4, $2, 'Ready', $3, now(), now() - interval '1 minute', false, false),
       ($5, $2, 'Plain', $3, now(), now() - interval '1 minute', false, false)`,
    [waiting, token, JPEG, ready, plain],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, graded)
     values ($1, $2, 'Old', $3, now(), now() - interval '1 minute', true)`,
    [legacy, token, JPEG],
  );
  await sql(
    `insert into events (id, name, duration_hours, ends_at, reveal_at)
     values ($1, 'Roll', 8, now() + interval '1 hour', now() + interval '2 hours')`,
    [eventId],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, event_id, created_at, ready_at, graded, chemistry)
     values ($1, $2, 'Sealed', $3, $4, now(), now() + interval '2 hours', true, 'default')`,
    [sealed, token, JPEG, eventId],
  );

  const early = await chooseChemistry(waiting, token, "daylight");
  assert.deepEqual(early, { chemistry: "daylight", develop: false });
  const cleared = await chooseChemistry(waiting, token, null);
  assert.deepEqual(cleared, { chemistry: null, develop: false });
  const undone = await sql<{ chemistry: string | null; developed_at: string | null }>(
    `select chemistry, developed_at from photos where id = $1`,
    [waiting],
  );
  assert.equal(undone[0]?.chemistry ?? null, null);
  assert.equal(undone[0]?.developed_at ?? null, null);
  const restored = await chooseChemistry(waiting, token, "daylight");
  assert.deepEqual(restored, { chemistry: "daylight", develop: false });
  const hidden = await sql<{ developed_at: string | null }>(`select developed_at from photos where id = $1`, [waiting]);
  assert.equal(hidden[0]?.developed_at ?? null, null);
  assert.equal(await readLatent(waiting, token), null);

  const due = await chooseChemistry(ready, token, "night");
  assert.deepEqual(due, { chemistry: "night", develop: true });
  const latent = await readLatent(ready, token);
  assert.ok(latent && latent.length > 100);
  const before = await sql<{ developed_at: string | null }>(`select developed_at from photos where id = $1`, [ready]);
  assert.equal(before[0]?.developed_at ?? null, null);

  await assert.rejects(developPhoto(ready, token, null), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });

  const printed = await developPhoto(ready, token, { imageBase64: JPEG, chemistry: "night" });
  assert.ok(printed.developedAt > 0);
  const row = await sql<{ graded: boolean; chemistry: string; developed_at: string | null }>(
    `select graded, chemistry, developed_at from photos where id = $1`,
    [ready],
  );
  assert.equal(row[0]?.graded, true);
  assert.equal(row[0]?.chemistry, "night");
  assert.ok(row[0]?.developed_at);
  assert.equal(await readLatent(ready, token), null);

  await assert.rejects(developPhoto(ready, token, { imageBase64: JPEG, chemistry: "daylight" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  await assert.rejects(chooseChemistry(ready, token, "daylight"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });

  const kept = await sql<{ chemistry: string }>(`select chemistry from photos where id = $1`, [ready]);
  assert.equal(kept[0]?.chemistry, "night");

  const revealed = await developPhoto(legacy, token, null);
  assert.ok(revealed.developedAt > 0);
  const old = await sql<{ chemistry: string | null; graded: boolean }>(
    `select chemistry, graded from photos where id = $1`,
    [legacy],
  );
  assert.equal(old[0]?.graded, true);
  assert.equal(old[0]?.chemistry ?? null, null);

  const standard = await developPhoto(plain, token, { imageBase64: JPEG, chemistry: "default" });
  assert.ok(standard.developedAt > 0);
  const bath = await sql<{ chemistry: string; graded: boolean }>(`select chemistry, graded from photos where id = $1`, [plain]);
  assert.equal(bath[0]?.chemistry, "default");
  assert.equal(bath[0]?.graded, true);

  await assert.rejects(chooseChemistry(sealed, token, "night"), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  await assert.rejects(developPhoto(waiting, token, { imageBase64: JPEG, chemistry: "daylight" }), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  await assert.rejects(chooseChemistry(ready, token, null), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
  await assert.rejects(chooseChemistry(sealed, token, null), (error: unknown) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 409);
    return true;
  });
});

test("a second tap clears the bath, and developing with none uses the ordinary one", async () => {
  const token = randomUUID();
  await camera(token);
  const ready = randomUUID();
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, graded, date_stamp)
     values ($1, $2, 'Undo', $3, now(), now() - interval '1 minute', false, false)`,
    [ready, token, JPEG],
  );

  assert.deepEqual(await chooseChemistry(ready, token, "daylight"), { chemistry: "daylight", develop: true });
  assert.deepEqual(await chooseChemistry(ready, token, "night"), { chemistry: "night", develop: true });
  assert.deepEqual(await chooseChemistry(ready, token, null), { chemistry: null, develop: true });
  const open = await sql<{ chemistry: string | null; graded: boolean; developed_at: string | null }>(
    `select chemistry, graded, developed_at from photos where id = $1`,
    [ready],
  );
  assert.equal(open[0]?.chemistry ?? null, null);
  assert.equal(open[0]?.graded, false);
  assert.equal(open[0]?.developed_at ?? null, null);

  const printed = await developPhoto(ready, token, { imageBase64: JPEG, chemistry: "default" });
  assert.ok(printed.developedAt > 0);
  const bath = await sql<{ chemistry: string; graded: boolean }>(
    `select chemistry, graded from photos where id = $1`,
    [ready],
  );
  assert.equal(bath[0]?.chemistry, "default");
  assert.equal(bath[0]?.graded, true);
});

test("a clear is an explicit null, and a missing bath is refused", () => {
  assert.equal(readChemistryChoice({ chemistry: null }), null);
  assert.equal(readChemistryChoice({ chemistry: "daylight" }), "daylight");
  assert.equal(readChemistryChoice({ chemistry: "night" }), "night");
  assert.equal(readChemistryChoice({ chemistry: "default" }), "default");
  for (const body of [{}, { chemistry: "" }, { caption: "Daylight" }]) {
    assert.throws(
      () => readChemistryChoice(body),
      (error: unknown) => error instanceof HttpError && error.status === 400,
    );
  }
  assert.throws(
    () => readChemistryChoice({ chemistry: "push" }),
    (error: unknown) => error instanceof HttpError && error.status === 400,
  );
});
