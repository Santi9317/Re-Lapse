import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { NOTE_HANDS } from "@/lib/frame-note";
import { listFeed, removeFrameNote, setFrameNote } from "@/server/store";
import { cleanFrameNote } from "@/server/validate";

test("a note is one short line", () => {
  assert.equal(cleanFrameNote("  hello there  "), "hello there");
  assert.equal(cleanFrameNote("stay\nwarm"), "stay warm");
  assert.throws(() => cleanFrameNote("   "), (err: unknown) => err instanceof HttpError && err.status === 400);
  assert.throws(() => cleanFrameNote("x".repeat(81)), (err: unknown) => err instanceof HttpError && err.status === 400);
  assert.throws(() => cleanFrameNote("\u200b"), (err: unknown) => err instanceof HttpError && err.status === 400);
});

test("a note stays on that frame, and another phone can still write", async () => {
  const ada = randomUUID();
  const bea = randomUUID();
  const cam = randomUUID();
  const adaId = randomUUID();
  const beaId = randomUUID();
  const camId = randomUUID();
  const adaPhoto = randomUUID();
  const beaPhoto = randomUUID();
  const privatePhoto = randomUUID();
  const image = "a".repeat(120);

  for (const [token, id, name] of [
    [ada, adaId, "Ada"],
    [bea, beaId, "Bea"],
    [cam, camId, "Cam"],
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
     values ($1, $2, 'Ada frame', $3, now(), now(), now(), now()),
            ($4, $5, 'Bea frame', $3, now(), now(), now(), now()),
            ($6, $5, 'Still in the lab', $3, now(), now(), now(), null)`,
    [adaPhoto, ada, image, beaPhoto, bea, privatePhoto],
  );

  await assert.rejects(
    () => setFrameNote(adaPhoto, ada, "mine"),
    (err: unknown) => err instanceof HttpError && err.status === 403,
  );
  await assert.rejects(
    () => setFrameNote(privatePhoto, ada, "hidden"),
    (err: unknown) => err instanceof HttpError && err.status === 409,
  );

  const first = await setFrameNote(beaPhoto, ada, "wish you were here");
  assert.equal(first.length, 1);
  assert.equal(first[0]?.text, "wish you were here");
  assert.equal(first[0]?.profileName, "Ada");
  assert.equal(first[0]?.mine, true);
  assert.deepEqual(first[0]?.emojis, ["📷", "✨", "🌈"]);
  assert.equal(NOTE_HANDS.includes(first[0]?.hand ?? "caveat"), true);

  const second = await setFrameNote(beaPhoto, ada, "still here");
  assert.equal(second.length, 2);
  assert.equal(second.some((note) => note.text === "wish you were here"), true);
  assert.equal(second.some((note) => note.text === "still here"), true);

  const signed = second.find((note) => note.text === "still here");
  assert.ok(signed);
  await assert.rejects(
    () => removeFrameNote(beaPhoto, bea, signed.id),
    (err: unknown) => err instanceof HttpError && err.status === 404,
  );
  const kept = await removeFrameNote(beaPhoto, ada, signed.id);
  assert.equal(kept.length, 1);
  assert.equal(kept[0]?.text, "wish you were here");

  const both = await setFrameNote(adaPhoto, bea, "from the other phone");
  assert.equal(both.length, 1);
  assert.equal(both[0]?.profileName, "Bea");

  const feed = await listFeed(ada);
  const beaFrame = feed.find((item) => item.id === beaPhoto);
  const adaFrame = feed.find((item) => item.id === adaPhoto);
  assert.equal(beaFrame?.comments.some((note) => note.text === "wish you were here" && note.mine), true);
  assert.equal(adaFrame?.comments[0]?.text, "from the other phone");
  assert.equal(adaFrame?.comments[0]?.mine, false);
  assert.equal(adaFrame?.comments[0]?.text.includes("<"), false);

  for (let i = 0; i < 24; i += 1) {
    await sql(
      `insert into frame_notes (photo_id, shooter_token, body) values ($1, $2, 'full')`,
      [adaPhoto, randomUUID()],
    );
  }
  await assert.rejects(
    () => setFrameNote(adaPhoto, cam, "one more"),
    (err: unknown) => err instanceof HttpError && err.status === 409 && err.message === "The back of this frame is full.",
  );
});
