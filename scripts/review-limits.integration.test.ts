import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { adoptBooth, prepareBooth } from "@/server/booth";
import { askToJoin, takeGateGuess } from "@/server/gate";
import { GATE_GUESS_LIMIT } from "@/server/gate-key";
import { HttpError } from "@/server/http";
import { JOIN_LIMITS } from "@/server/join-line";
import { PIN_RESCUE_LIMIT, PIN_RESTORE_LIMIT } from "@/server/pin";
import { requestRecovery } from "@/server/profile-pin";
import { hashProfilePin, issueCamera } from "@/server/quota";
import { sql } from "@/lib/db";

async function ownPhone(): Promise<string> {
  const open = await prepareBooth("");
  assert.equal(open.shared, true);
  const owned = await prepareBooth(open.id);
  assert.equal(owned.shared, false);
  assert.equal(owned.fresh, true);
  assert.notEqual(owned.id, open.id);
  return owned.id;
}

function cameraRequest(token: string, proof: string, booth = ""): Request {
  const parts = [`relapse_auth=${token}.${proof}`];
  if (booth) parts.push(`relapse_booth=${booth}`);
  return new Request("http://127.0.0.1/api/gate", { headers: { cookie: parts.join("; ") } });
}

test("a new browser cannot mint booths or joins, and the right gate key still opens", async () => {
  const secret = "kept-on-the-server";
  for (let i = 0; i < GATE_GUESS_LIMIT; i += 1) {
    const miss = await takeGateGuess(randomUUID(), `nope-${i}`, secret);
    assert.equal(miss.result, "wrong");
    assert.equal(miss.clientId, "");
  }
  const blocked = await takeGateGuess(randomUUID(), "still-nope", secret);
  assert.equal(blocked.result, "blocked");
  const opened = await takeGateGuess("", secret, secret);
  assert.equal(opened.result, "ok");
  const stranger = await takeGateGuess(randomUUID(), "again", secret);
  assert.equal(stranger.result, "blocked");
  const own = await takeGateGuess(opened.clientId, "typo", secret);
  assert.equal(own.result, "wrong");

  const invented = randomUUID();
  await assert.rejects(() => issueCamera(null, null, invented), (error: unknown) => {
    return error instanceof HttpError && error.status === 400;
  });
  const issued = await adoptBooth(invented);
  assert.notEqual(issued, invented);

  const phone = await ownPhone();
  for (let i = 0; i < JOIN_LIMITS.perPhone; i += 1) {
    await sql(
      `insert into join_requests (id, camera_token, display_name, status, booth)
       values ($1, $2, 'Cam', 'pending', $3)`,
      [randomUUID(), randomUUID(), phone],
    );
  }
  const crowded = await issueCamera(null, null, phone);
  await assert.rejects(
    () => askToJoin(cameraRequest(crowded.token, crowded.proof, phone), "Ada", phone),
    (error: unknown) => error instanceof HttpError && error.status === 429 && /minute/.test(error.message),
  );

  const quiet = await ownPhone();
  const member = await issueCamera(null, null, quiet);
  const joined = await askToJoin(cameraRequest(member.token, member.proof, quiet), "Bea", quiet);
  assert.equal(joined.status, "pending");
  assert.equal(joined.token, member.token);
  const boothOnly = new Request("http://127.0.0.1/api/gate", {
    headers: { cookie: `relapse_booth=${quiet}` },
  });
  await assert.rejects(
    () => askToJoin(boothOnly, "Bea", quiet),
    (error: unknown) => error instanceof HttpError && error.status === 409,
  );

  const pending = await sql<{ n: number }>(`select count(*)::int as n from join_requests where status = 'pending'`);
  const have = Number(pending[0]?.n ?? 0);
  for (let i = have; i < JOIN_LIMITS.pendingMax; i += 1) {
    await sql(
      `insert into join_requests (id, camera_token, display_name, status, booth)
       values ($1, $2, 'Cam', 'pending', $3)`,
      [randomUUID(), randomUUID(), randomUUID()],
    );
  }
  const again = await askToJoin(cameraRequest(member.token, member.proof, quiet), "Bea", quiet);
  assert.equal(again.token, member.token);
  assert.equal(again.status, "pending");

  const freshBooth = await ownPhone();
  const fresh = await issueCamera(null, null, freshBooth);
  await assert.rejects(
    () => askToJoin(cameraRequest(fresh.token, fresh.proof, freshBooth), "Cio", freshBooth),
    (error: unknown) => error instanceof HttpError && error.status === 429 && /full/.test(error.message),
  );

  const open = await adoptBooth("");
  for (let i = 0; i < 40; i += 1) {
    assert.equal(await adoptBooth(""), open);
    assert.equal(await adoptBooth(randomUUID()), open);
  }
  const claimed = await prepareBooth(open);
  assert.equal(claimed.fresh, true);
  assert.notEqual(claimed.id, open);
  assert.notEqual(await adoptBooth(""), open);
  const kept = await adoptBooth(quiet);
  assert.equal(kept, quiet);
  const older = randomUUID();
  await sql(`insert into camera_mints (token, created_at, booth) values ($1, now(), $2)`, [randomUUID(), older]);
  assert.equal(await adoptBooth(older), older);

  const owner = randomUUID();
  const pinHash = await hashProfilePin("048213");
  await sql(`insert into cameras (token, created_at, pin_hash) values ($1, now(), $2)`, [owner, pinHash]);
  await sql(
    `insert into profiles (id, shooter_token, username, emoji_1, emoji_2, emoji_3, carousel)
     values ($1, $2, 'PinAda', '📷', '✨', '🌈', '[]')`,
    [randomUUID(), owner],
  );

  for (let i = 0; i < PIN_RESTORE_LIMIT; i += 1) {
    const miss = await requestRecovery(await ownPhone(), "000000", "PinAda", true);
    assert.equal(miss.ok, false);
    if (!miss.ok) assert.equal(miss.reason, "wrong");
  }
  const anonShut = await requestRecovery(await ownPhone(), "111111", "PinAda", true);
  assert.equal(anonShut.ok, false);
  if (!anonShut.ok) assert.equal(anonShut.reason, "blocked");
  const freshRight = await requestRecovery(await ownPhone(), "048213", "PinAda", true);
  assert.equal(freshRight.ok, true);

  const noisy = await ownPhone();
  for (let i = 0; i < PIN_RESTORE_LIMIT; i += 1) {
    const miss = await requestRecovery(noisy, "222222", "PinAda", false);
    assert.equal(miss.ok, false);
    if (!miss.ok) assert.equal(miss.reason, "wrong");
  }
  const ownShut = await requestRecovery(noisy, "333333", "PinAda", false);
  assert.equal(ownShut.ok, false);
  if (!ownShut.ok) assert.equal(ownShut.reason, "blocked");
  const ownRight = await requestRecovery(noisy, "048213", "PinAda", false);
  assert.equal(ownRight.ok, true);
  const neighbor = await requestRecovery(await ownPhone(), "444444", "PinAda", false);
  assert.equal(neighbor.ok, false);
  if (!neighbor.ok) assert.equal(neighbor.reason, "wrong");

  for (let i = 0; i < PIN_RESCUE_LIMIT - 1; i += 1) {
    const opened = await requestRecovery(await ownPhone(), "048213", "PinAda", true);
    assert.equal(opened.ok, true);
  }
  const rescueShut = await requestRecovery(await ownPhone(), "048213", "PinAda", true);
  assert.equal(rescueShut.ok, false);
  if (!rescueShut.ok) assert.equal(rescueShut.reason, "blocked");
  const keptRight = await requestRecovery(await ownPhone(), "048213", "PinAda", false);
  assert.equal(keptRight.ok, true);
});
