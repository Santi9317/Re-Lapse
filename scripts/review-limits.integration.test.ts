import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { adoptBooth, prepareBooth } from "@/server/booth";
import { askToJoin, takeGateGuess } from "@/server/gate";
import { GATE_GUESS_LIMIT } from "@/server/gate-key";
import { HttpError } from "@/server/http";
import { JOIN_LIMITS } from "@/server/join-line";
import { MINT_LIMITS } from "@/server/mint";
import { SHARED_PHONE } from "@/server/phone-budget";
import { PIN_RESTORE_LIMIT } from "@/server/pin";
import { requestRecovery } from "@/server/profile-pin";
import { hashProfilePin, issueCamera } from "@/server/quota";
import { sql } from "@/lib/db";

async function ownPhone(): Promise<string> {
  const open = await prepareBooth("");
  assert.equal(open.shared, true);
  assert.equal(await phoneOf(open.id), SHARED_PHONE);
  const owned = await prepareBooth(open.id);
  assert.equal(owned.shared, false);
  assert.equal(owned.fresh, true);
  assert.notEqual(owned.id, open.id);
  assert.equal(await phoneOf(owned.id), owned.id);
  return owned.id;
}

async function phoneOf(booth: string): Promise<string> {
  const rows = await sql<{ phone: string }>(`select phone from issued_booths where id = $1`, [booth]);
  return String(rows[0]?.phone ?? "");
}

/** A claimed booth. Its phone is its own id. */
async function establishedPhone(): Promise<string> {
  return ownPhone();
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

  const rotated = await ownPhone();
  const rotatedCam = await issueCamera(null, null, rotated);
  const rotatedJoin = await askToJoin(cameraRequest(rotatedCam.token, rotatedCam.proof, rotated), "Ada", rotated);
  assert.equal(rotatedJoin.status, "pending");
  assert.equal(rotatedJoin.token, rotatedCam.token);

  const quiet = await establishedPhone();
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

  const guessing = await ownPhone();
  for (let i = 0; i < PIN_RESTORE_LIMIT; i += 1) {
    const miss = await requestRecovery(guessing, "000000", "PinAda");
    assert.equal(miss.ok, false);
    if (!miss.ok) assert.equal(miss.reason, "wrong");
  }
  const ownShut = await requestRecovery(guessing, "111111", "PinAda");
  assert.equal(ownShut.ok, false);
  if (!ownShut.ok) assert.equal(ownShut.reason, "blocked");
  const neighborMiss = await requestRecovery(await ownPhone(), "222222", "PinAda");
  assert.equal(neighborMiss.ok, false);
  if (!neighborMiss.ok) assert.equal(neighborMiss.reason, "wrong");
  const neighborRight = await requestRecovery(await ownPhone(), "048213", "PinAda");
  assert.equal(neighborRight.ok, true);

  const rescuer = await ownPhone();
  const firstRescue = await requestRecovery(rescuer, "048213", "PinAda");
  assert.equal(firstRescue.ok, true);
  const sameRescue = await requestRecovery(rescuer, "048213", "PinAda");
  assert.equal(sameRescue.ok, true);
  const otherRescue = await requestRecovery(await ownPhone(), "048213", "PinAda");
  assert.equal(otherRescue.ok, true);

  const miner = await ownPhone();
  for (let i = 0; i < MINT_LIMITS.perPhone; i += 1) {
    const cam = await issueCamera(null, null, miner);
    assert.equal(cam.token.length > 0, true);
  }
  await assert.rejects(
    () => issueCamera(null, null, miner),
    (error: unknown) => error instanceof HttpError && error.status === 429 && /minute/.test(error.message),
  );
  const otherMiner = await ownPhone();
  const otherCam = await issueCamera(null, null, otherMiner);
  assert.equal(otherCam.token.length > 0, true);

  const counted = await sql<{ n: number }>(
    `select count(*)::int as n from camera_mints where created_at > now() - interval '10 minutes'`,
  );
  const haveMints = Number(counted[0]?.n ?? 0);
  for (let i = haveMints; i < MINT_LIMITS.labWindow; i += 1) {
    await sql(`insert into camera_mints (token, created_at, booth) values ($1, now(), $2)`, [randomUUID(), miner]);
  }
  const labFull = await ownPhone();
  await assert.rejects(
    () => issueCamera(null, null, labFull),
    (error: unknown) => error instanceof HttpError && error.status === 429 && /minute/.test(error.message),
  );
});
