import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { adoptBooth } from "@/server/booth";
import { askToJoin, takeGateGuess } from "@/server/gate";
import { GATE_GUESS_LIMIT } from "@/server/gate-key";
import { HttpError } from "@/server/http";
import { JOIN_LIMITS } from "@/server/join-line";
import { issueCamera } from "@/server/quota";
import { sql } from "@/lib/db";

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

  const phone = await adoptBooth("");
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

  const quiet = await adoptBooth("");
  const member = await issueCamera(null, null, quiet);
  const joined = await askToJoin(cameraRequest(member.token, member.proof, quiet), "Bea", quiet);
  assert.equal(joined.status, "pending");
  assert.equal(joined.token, member.token);

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

  const freshBooth = await adoptBooth("");
  const fresh = await issueCamera(null, null, freshBooth);
  await assert.rejects(
    () => askToJoin(cameraRequest(fresh.token, fresh.proof, freshBooth), "Cio", freshBooth),
    (error: unknown) => error instanceof HttpError && error.status === 429 && /full/.test(error.message),
  );

  let openedBooths = 0;
  for (;;) {
    try {
      await adoptBooth("");
      openedBooths += 1;
    } catch (error) {
      assert.ok(error instanceof HttpError && error.status === 429);
      break;
    }
    assert.ok(openedBooths < 40);
  }
  const kept = await adoptBooth(quiet);
  assert.equal(kept, quiet);
  const older = randomUUID();
  await sql(`insert into camera_mints (token, created_at, booth) values ($1, now(), $2)`, [randomUUID(), older]);
  assert.equal(await adoptBooth(older), older);
});
