import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { DELETE as deleteProfileRoute } from "@/app/api/gate/admin/profiles/[id]/route";
import { GET as listGate } from "@/app/api/gate/admin/requests/route";
import { GET as readProfileRoute, PUT as saveProfileRoute } from "@/app/api/profile/route";
import { sql } from "@/lib/db";
import { gateCookie } from "@/server/gate-key";
import { listRecoveryRequests } from "@/server/profile-pin";
import { cameraProof } from "@/server/quota";
import { listActiveProfiles, listFeed, readPublicProfile, removeProfile } from "@/server/store";

const SECRET = "gate-test-secret";

function gateRequest(path: string, method = "GET"): Request {
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: {
      "x-relapse-gate": "1",
      cookie: `relapse_gate=${gateCookie(SECRET)}`,
    },
  });
}

function cameraRequest(path: string, method: string, token: string, proof: string, body?: unknown, replace = false): Request {
  const headers: Record<string, string> = { cookie: `relapse_auth=${token}.${proof}` };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (replace) headers["x-relapse-replace-profile"] = "1";
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("the gate lists every active profile, and delete removes that profile from the app", async () => {
  process.env.RELAPSE_ADMIN_TOKEN = SECRET;
  const ada = randomUUID();
  const bea = randomUUID();
  const adaId = randomUUID();
  const beaId = randomUUID();
  const adaPhoto = randomUUID();
  const beaPhoto = randomUUID();
  const adaRescue = randomUUID();
  const beaRescue = randomUUID();
  const booth = randomUUID();
  const image = "a".repeat(120);
  const adaProof = await cameraProof(ada);

  for (const token of [ada, bea]) {
    await sql(`insert into cameras (token, created_at) values ($1, now())`, [token]);
    await sql(
      `insert into join_requests (id, camera_token, display_name, status) values ($1, $2, 'Cam', 'accepted')`,
      [randomUUID(), token],
    );
  }
  await sql(
    `insert into profiles (id, shooter_token, username, emoji_1, emoji_2, emoji_3, carousel)
     values ($1, $2, 'Ada', '📷', '✨', '🌈', '[]'), ($3, $4, 'Bea', '🌸', '⭐', '🎵', '[]')`,
    [adaId, ada, beaId, bea],
  );
  await sql(
    `insert into photos (id, shooter_token, caption, image_b64, created_at, ready_at, developed_at, published_at)
     values ($1, $2, 'Ada frame', $3, now(), now(), now(), now()),
            ($4, $5, 'Bea frame', $3, now(), now(), now(), now())`,
    [adaPhoto, ada, image, beaPhoto, bea],
  );
  await sql(
    `insert into stickers (photo_id, shooter_token, emoji) values ($1, $2, '📷')`,
    [beaPhoto, ada],
  );
  await sql(
    `insert into recovery_requests (id, camera_token, booth, status) values ($1, $2, $3, 'pending'), ($4, $5, $3, 'pending')`,
    [adaRescue, ada, booth, beaRescue, bea],
  );

  const listed = await listActiveProfiles();
  assert.deepEqual(
    listed.map((profile) => profile.username),
    ["Ada", "Bea"],
  );
  assert.deepEqual(listed[0]?.emojis, ["📷", "✨", "🌈"]);

  const opened = await listGate(gateRequest("/api/gate/admin/requests"));
  assert.equal(opened.status, 200);
  const portal = (await opened.json()) as {
    requests: unknown[];
    recoveries: { id: string; name: string }[];
    profiles: { id: string; username: string }[];
  };
  assert.ok(Array.isArray(portal.requests));
  assert.deepEqual(
    portal.profiles.map((profile) => profile.username),
    ["Ada", "Bea"],
  );
  assert.deepEqual(
    portal.recoveries.map((item) => item.name).sort(),
    ["Ada", "Bea"],
  );

  const shut = await listGate(new Request("http://127.0.0.1/api/gate/admin/requests"));
  assert.equal(shut.status, 401);
  const shutBody = JSON.stringify(await shut.json());
  assert.equal(shutBody.includes("Ada"), false);

  const before = await listFeed(bea);
  const beaFrame = before.find((item) => item.id === beaPhoto);
  const adaFrame = before.find((item) => item.id === adaPhoto);
  assert.equal(beaFrame?.profileName, "Bea");
  assert.equal(adaFrame?.profileName, "Ada");
  assert.equal(beaFrame?.stickers.some((sticker) => sticker.profileId === adaId), true);

  const denied = await deleteProfileRoute(new Request(`http://127.0.0.1/api/gate/admin/profiles/${adaId}`, { method: "DELETE" }), {
    params: Promise.resolve({ id: adaId }),
  });
  assert.equal(denied.status, 401);
  assert.equal((await listActiveProfiles()).some((profile) => profile.id === adaId), true);

  const removed = await deleteProfileRoute(gateRequest(`/api/gate/admin/profiles/${adaId}`, "DELETE"), {
    params: Promise.resolve({ id: adaId }),
  });
  assert.equal(removed.status, 200);

  const afterList = await listActiveProfiles();
  assert.deepEqual(
    afterList.map((profile) => profile.id),
    [beaId],
  );
  assert.equal(await readPublicProfile(adaId), null);
  assert.equal((await readPublicProfile(beaId))?.username, "Bea");

  const photos = await sql<{ id: string }>(`select id from photos where id = $1`, [adaPhoto]);
  assert.equal(photos[0]?.id, adaPhoto);
  const stickerRow = await sql<{ emoji: string }>(
    `select emoji from stickers where photo_id = $1 and shooter_token = $2`,
    [beaPhoto, ada],
  );
  assert.equal(stickerRow[0]?.emoji, "📷");

  const afterFeed = await listFeed(bea);
  const beaAfter = afterFeed.find((item) => item.id === beaPhoto);
  const adaAfter = afterFeed.find((item) => item.id === adaPhoto);
  assert.equal(beaAfter?.profileName, "Bea");
  assert.equal(adaAfter?.profileId, null);
  assert.equal(adaAfter?.profileName, null);
  assert.equal(beaAfter?.stickers.length, 0);

  const rescues = await listRecoveryRequests();
  assert.equal(rescues.some((item) => item.id === adaRescue), false);
  assert.equal(rescues.some((item) => item.id === beaRescue), true);
  const keptRescue = await sql<{ id: string }>(`select id from recovery_requests where id = $1`, [adaRescue]);
  assert.equal(keptRescue[0]?.id, adaRescue);

  const own = await readProfileRoute(cameraRequest("/api/profile", "GET", ada, adaProof));
  assert.equal(own.status, 410);
  const ownBody = (await own.json()) as { removed?: boolean };
  assert.equal(ownBody.removed, true);

  const blocked = await saveProfileRoute(
    cameraRequest("/api/profile", "PUT", ada, adaProof, {
      username: "Ada",
      emojis: ["📷", "✨", "🌈"],
      carouselIds: [],
    }),
  );
  assert.equal(blocked.status, 409);

  const replaced = await saveProfileRoute(
    cameraRequest(
      "/api/profile",
      "PUT",
      ada,
      adaProof,
      { username: "Ada", emojis: ["📷", "✨", "🌈"], carouselIds: [] },
      true,
    ),
  );
  assert.equal(replaced.status, 200);
  const created = (await replaced.json()) as { id: string; username: string };
  assert.equal(created.username, "Ada");
  assert.notEqual(created.id, adaId);
  assert.equal(await readPublicProfile(adaId), null);
  assert.equal((await listActiveProfiles()).some((profile) => profile.id === created.id), true);
  assert.equal((await listActiveProfiles()).some((profile) => profile.id === beaId), true);
  const beaStill = await readPublicProfile(beaId);
  assert.deepEqual(beaStill?.emojis, ["🌸", "⭐", "🎵"]);

  const restored = await listFeed(bea);
  const beaRestored = restored.find((item) => item.id === beaPhoto);
  assert.equal(beaRestored?.stickers[0]?.emoji, "📷");
  assert.equal(beaRestored?.stickers[0]?.profileId, created.id);
  assert.equal(restored.find((item) => item.id === adaPhoto)?.profileId, created.id);

  const again = await deleteProfileRoute(gateRequest(`/api/gate/admin/profiles/${adaId}`, "DELETE"), {
    params: Promise.resolve({ id: adaId }),
  });
  assert.equal(again.status, 404);
  assert.equal(await removeProfile(randomUUID()), false);
});
