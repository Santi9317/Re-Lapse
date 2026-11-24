import { randomUUID } from "node:crypto";
import { sql, withTransaction, type Sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { gateCookie, gateSecret, guessMayCompare, sameSecret } from "@/server/gate-key";
import { JOIN_LIMITS, joinRoom } from "@/server/join-line";
import { cameraProof, provenCamera } from "@/server/quota";
import { isUuid } from "@/server/validate";

export type GateDecision = "pending" | "accepted" | "declined";

export type Membership = {
  token: string;
  proof: string;
  status: GateDecision;
  name: string;
};

type MembershipRow = {
  display_name: string;
  status: string;
};

function decision(value: unknown): GateDecision {
  if (value === "pending" || value === "accepted" || value === "declined") return value;
  throw new HttpError(500, "The lab hit a snag.");
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(prefix)) continue;
    try {
      return decodeURIComponent(trimmed.slice(prefix.length));
    } catch {
      return "";
    }
  }
  return "";
}

async function findByToken(token: string): Promise<{ status: GateDecision; name: string } | null> {
  const rows = await sql<MembershipRow>(
    `select display_name, status from join_requests where camera_token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  return { status: decision(row.status), name: String(row.display_name) };
}

export async function readMembership(request: Request): Promise<{ status: GateDecision; name: string } | null> {
  const token = await provenCamera(request);
  if (!token) return null;
  return findByToken(token);
}

function countOf(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function lockJoinLine(q: Sql): Promise<void> {
  await q(`insert into join_queue_lock (id) values (1) on conflict (id) do nothing`);
  await q(`select id from join_queue_lock where id = 1 for update`);
}

export async function askToJoin(request: Request, name: string, booth: string): Promise<Membership> {
  const known = await provenCamera(request);
  if (known) {
    const existing = await findByToken(known);
    if (existing) {
      return { token: known, proof: await cameraProof(known), status: existing.status, name: existing.name };
    }
    const reserved = await withTransaction(async (q) => {
      await lockJoinLine(q);
      const counts = await q<{ pending: number; recent: number }>(
        `select
           (select count(*)::int from join_requests where status = 'pending') as pending,
           (select count(*)::int from join_requests where created_at > now() - ($1::int * interval '1 millisecond')) as recent`,
        [JOIN_LIMITS.windowMs],
      );
      const pending = countOf(counts[0]?.pending);
      const recent = countOf(counts[0]?.recent);
      if (!joinRoom(pending, recent)) return false;
      const inserted = await q<{ camera_token: string }>(
        `insert into join_requests (id, camera_token, display_name, status)
         values ($1, $2, $3, 'pending')
         on conflict (camera_token) do nothing
         returning camera_token`,
        [randomUUID(), known, name],
      );
      return Boolean(inserted[0]);
    });
    if (!reserved) throw new HttpError(429, "The line is full. Try again shortly.");
    const row = await findByToken(known);
    if (!row) throw new HttpError(500, "The lab hit a snag.");
    return { token: known, proof: await cameraProof(known), status: row.status, name: row.name };
  }

  if (!isUuid(booth)) throw new HttpError(400, "The lab didn't answer.");
  const token = randomUUID();
  const reserved = await withTransaction(async (q) => {
    await lockJoinLine(q);
    const counts = await q<{ pending: number; recent: number }>(
      `select
         (select count(*)::int from join_requests where status = 'pending') as pending,
         (select count(*)::int from join_requests where created_at > now() - ($1::int * interval '1 millisecond')) as recent`,
      [JOIN_LIMITS.windowMs],
    );
    const pending = countOf(counts[0]?.pending);
    const recent = countOf(counts[0]?.recent);
    if (!joinRoom(pending, recent)) return false;
    await q(
      `insert into cameras (token, created_at) values ($1, now()) on conflict (token) do nothing`,
      [token],
    );
    await q(
      `insert into join_requests (id, camera_token, display_name, status) values ($1, $2, $3, 'pending')`,
      [randomUUID(), token, name],
    );
    return true;
  });
  if (!reserved) throw new HttpError(429, "The line is full. Try again shortly.");
  const proof = await cameraProof(token);
  const row = await findByToken(token);
  if (!row) throw new HttpError(500, "The lab hit a snag.");
  return { token, proof, status: row.status, name: row.name };
}

/**
 * A PIN brings back the camera that already has this profile.
 * An accepted camera stays accepted. A declined one stays declined.
 * A missing row is the approval that was already given when the profile was saved.
 */
export async function ensureRestoredApproval(
  token: string,
  name: string,
): Promise<{ status: GateDecision; name: string }> {
  const existing = await findByToken(token);
  if (existing) return existing;
  const display = name.trim().slice(0, 40) || "Camera";
  await sql(
    `insert into join_requests (id, camera_token, display_name, status, decided_at)
     values ($1, $2, $3, 'accepted', now())
     on conflict (camera_token) do nothing`,
    [randomUUID(), token, display],
  );
  const row = await findByToken(token);
  if (!row) throw new HttpError(500, "The lab hit a snag.");
  return row;
}

export async function isAccepted(token: string): Promise<boolean> {
  const row = await findByToken(token);
  return row?.status === "accepted";
}

export async function acceptedViewer(request: Request): Promise<string | null> {
  const token = await provenCamera(request);
  if (!token) return null;
  if (!(await isAccepted(token))) return null;
  return token;
}

export async function requireMember(request: Request): Promise<string> {
  const token = await provenCamera(request);
  if (!token) throw new HttpError(403, "This camera hasn't been issued.");
  const row = await findByToken(token);
  if (row?.status === "accepted") return token;
  if (row?.status === "declined") throw new HttpError(403, "This camera stays outside.");
  throw new HttpError(403, "Santiago hasn't let this camera in.");
}

export type PendingRequest = {
  id: string;
  name: string;
  createdAt: number;
};

export async function listPending(): Promise<PendingRequest[]> {
  const rows = await sql<{ id: string; display_name: string; created_ms: number | string }>(
    `select id, display_name, (extract(epoch from created_at) * 1000) as created_ms
     from join_requests
     where status = 'pending'
     order by created_at asc
     limit $1`,
    [JOIN_LIMITS.pendingMax],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.display_name),
    createdAt: Math.round(Number(row.created_ms)),
  }));
}

async function keepCamera(token: string): Promise<void> {
  await sql(
    `insert into cameras (token, created_at) values ($1, now()) on conflict (token) do nothing`,
    [token],
  );
}

export async function decideRequest(id: string, status: "accepted" | "declined"): Promise<void> {
  const updated = await sql<{ camera_token: string }>(
    `update join_requests
     set status = $2, decided_at = now()
     where id = $1 and status = 'pending'
     returning camera_token`,
    [id, status],
  );
  const minted = updated[0]?.camera_token;
  if (minted) {
    if (status === "accepted") await keepCamera(String(minted));
    return;
  }

  const current = await sql<{ status: string; camera_token: string }>(
    `select status, camera_token from join_requests where id = $1`,
    [id],
  );
  const row = current[0];
  if (!row || row.status !== status) throw new HttpError(404, "That request is already settled.");
  if (status === "accepted") await keepCamera(String(row.camera_token));
}

const GUESS_WINDOW_MS = 15 * 60_000;

function guessFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export type GateGuessResult = "ok" | "wrong" | "blocked";

/**
 * Checks a gate key only when this browser still has room. The check and the
 * count share one lock, so parallel guesses cannot all read the old total.
 * A browser that is already full is refused before the key is compared.
 * The key itself is not written.
 */
export async function takeGateGuess(clientId: string, given: string, secret: string): Promise<GateGuessResult> {
  if (!isUuid(clientId)) return "blocked";
  return withTransaction(async (q) => {
    await q(
      `insert into gate_guess_slot (id, window_start, n) values (1, now(), 0) on conflict (id) do nothing`,
    );
    await q(`select id from gate_guess_slot where id = 1 for update`);
    await q(`delete from gate_client where window_start <= now() - interval '2 hours'`);
    const existing = await q<{ n: number; fresh: boolean | string | number }>(
      `select n,
              window_start <= now() - ($2::int * interval '1 millisecond') as fresh
       from gate_client
       where id = $1
       for update`,
      [clientId, GUESS_WINDOW_MS],
    );
    const row = existing[0];
    const isNewClient = !row;
    const failures = !row || guessFlag(row.fresh) ? 0 : countOf(row.n);
    let otherClients = 0;
    if (isNewClient) {
      const active = await q<{ n: number }>(
        `select count(*)::int as n
         from gate_client
         where n > 0
           and window_start > now() - ($1::int * interval '1 millisecond')`,
        [GUESS_WINDOW_MS],
      );
      otherClients = countOf(active[0]?.n);
    }
    if (!guessMayCompare(failures, otherClients, isNewClient)) return "blocked";
    const matches = given.length > 0 && sameSecret(given, secret);
    if (isNewClient) {
      await q(
        `insert into gate_client (id, window_start, n) values ($1, now(), $2)`,
        [clientId, matches ? 0 : 1],
      );
    } else if (matches || guessFlag(row.fresh)) {
      await q(
        `update gate_client set n = $2, window_start = now() where id = $1`,
        [clientId, matches ? 0 : 1],
      );
    } else {
      await q(`update gate_client set n = n + 1 where id = $1`, [clientId]);
    }
    return matches ? "ok" : "wrong";
  });
}

export function assertGate(request: Request): void {
  const secret = gateSecret();
  if (!secret) throw new HttpError(503, "The gate isn't set up on this server.");
  if (request.headers.get("x-relapse-gate") !== "1") {
    throw new HttpError(401, "That key doesn't open the gate.");
  }
  const cookie = readCookie(request, "relapse_gate");
  if (!cookie || !sameSecret(cookie, gateCookie(secret))) {
    throw new HttpError(401, "That key doesn't open the gate.");
  }
}
