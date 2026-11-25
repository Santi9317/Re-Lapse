import { randomUUID, timingSafeEqual } from "node:crypto";
import { sql, withTransaction, type Sql } from "@/lib/db";
import { budgetPhone } from "@/server/phone-budget";
import { labPinOpen, pinRestoreDecision, rescueLabRoom, rescueRoom } from "@/server/pin";
import { hashProfilePin } from "@/server/quota";
import { isUuid } from "@/server/validate";

const WINDOW_MS = 15 * 60_000;
const RESCUE_WINDOW_MS = 10 * 60_000;
const LAB_PIN = "pin-lab";

function countOf(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function guessFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function hashMatches(stored: string, given: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(stored) || !/^[0-9a-f]{64}$/i.test(given)) return false;
  return timingSafeEqual(Buffer.from(stored, "hex"), Buffer.from(given, "hex"));
}

type Budget = { recent: number; fresh: boolean };

async function lockPinClient(q: Sql, id: string, windowMs: number): Promise<Budget> {
  await q(
    `insert into pin_client (id, window_start, n) values ($1, now(), 0) on conflict (id) do nothing`,
    [id],
  );
  const slot = await q<{ n: number; fresh: boolean | string | number }>(
    `select n,
            window_start <= now() - ($2::int * interval '1 millisecond') as fresh
     from pin_client
     where id = $1
     for update`,
    [id, windowMs],
  );
  const fresh = guessFlag(slot[0]?.fresh);
  return { recent: fresh ? 0 : countOf(slot[0]?.n), fresh };
}

async function markPinClient(q: Sql, id: string, budget: Budget): Promise<void> {
  await q(
    `update pin_client
     set n = $2,
         window_start = case when $3::boolean then now() else window_start end
     where id = $1`,
    [id, budget.fresh ? 1 : budget.recent + 1, budget.fresh],
  );
}

/** Whether this camera has chosen a PIN. The digits are not stored. */
export async function recoveryPinSet(token: string): Promise<boolean> {
  const rows = await sql<{ pin_hash: string | null }>(`select pin_hash from cameras where token = $1`, [token]);
  const hash = rows[0]?.pin_hash ? String(rows[0].pin_hash) : "";
  return /^[0-9a-f]{64}$/i.test(hash);
}

/**
 * Stores this camera's hash only. Another camera is not read, so the same
 * digits can belong to a different name and the choice does not say so.
 */
export async function saveRecoveryPin(token: string, pin: string): Promise<boolean> {
  if (!isUuid(token)) return false;
  const hash = await hashProfilePin(pin);
  await sql(
    `insert into cameras (token, created_at, pin_hash)
     values ($1, now(), $2)
     on conflict (token) do update set pin_hash = excluded.pin_hash`,
    [token, hash],
  );
  await sql(`update profiles set pin_hash = $2 where shooter_token = $1`, [token, hash]);
  return true;
}

export type RescueAsk =
  | { ok: true; id: string; name: string; status: "pending" }
  | { ok: false; reason: "wrong" | "blocked" };

/**
 * A matching name and PIN open a request. They do not open the camera.
 * The match is decided before a miss is counted, so another phone cannot hold
 * this one shut. Wrong guesses stay on this phone, and so does the rescue
 * window. Another phone keeps its own counts. A ceiling across every phone
 * still bounds new phones. Zero matches and several matches look the same.
 */
export async function requestRecovery(booth: string, pin: string, name: string): Promise<RescueAsk> {
  if (!isUuid(booth)) return { ok: false, reason: "blocked" };
  const boothId = booth.toLowerCase();
  const wanted = name.trim().toLowerCase();
  const hash = await hashProfilePin(pin);
  return withTransaction(async (q) => {
    const phone = await budgetPhone(q, boothId);
    if (!phone) return { ok: false, reason: "blocked" };
    const waiting = await q<{ id: string; username: string }>(
      `select r.id, p.username
       from recovery_requests r
       join profiles p on p.shooter_token = r.camera_token
       where r.booth = $1 and r.status = 'pending'
       order by r.created_at desc
       limit 1`,
      [boothId],
    );
    if (waiting[0]?.id) {
      return { ok: true, id: String(waiting[0].id), name: String(waiting[0].username), status: "pending" };
    }
    const found = await q<{ token: string; username: string; pin_hash: string | null }>(
      `select c.token, p.username, c.pin_hash
       from cameras c
       join profiles p on p.shooter_token = c.token
       where c.pin_hash = $1 and lower(p.username) = $2`,
      [hash, wanted],
    );
    const row = found.length === 1 ? found[0] : undefined;
    const token = row?.token && isUuid(String(row.token)) ? String(row.token).toLowerCase() : "";
    const matches = token.length > 0 && hashMatches(String(row?.pin_hash ?? ""), hash);
    if (matches && row) {
      await lockPinClient(q, phone, RESCUE_WINDOW_MS);
      const recent = await q<{ n: number }>(
        `select count(*)::int as n
         from recovery_requests r
         where r.created_at > now() - ($2::int * interval '1 millisecond')
           and exists (
             select 1 from issued_booths b
             where b.id = r.booth and b.phone = $1
           )`,
        [phone, RESCUE_WINDOW_MS],
      );
      const labRescues = await q<{ n: number }>(
        `select count(*)::int as n
         from recovery_requests
         where created_at > now() - ($1::int * interval '1 millisecond')`,
        [RESCUE_WINDOW_MS],
      );
      if (!rescueRoom(countOf(recent[0]?.n)) || !rescueLabRoom(countOf(labRescues[0]?.n))) {
        return { ok: false, reason: "blocked" };
      }
      const id = randomUUID();
      await q(
        `insert into recovery_requests (id, camera_token, booth, status) values ($1, $2, $3, 'pending')`,
        [id, token, boothId],
      );
      return { ok: true, id, name: String(row.username), status: "pending" };
    }
    const lab = await lockPinClient(q, LAB_PIN, WINDOW_MS);
    if (!labPinOpen(lab.recent)) return { ok: false, reason: "blocked" };
    const budget = await lockPinClient(q, phone, WINDOW_MS);
    if (pinRestoreDecision(false, budget.recent) === "blocked") return { ok: false, reason: "blocked" };
    await markPinClient(q, phone, budget);
    await markPinClient(q, LAB_PIN, lab);
    return { ok: false, reason: "wrong" };
  });
}

export type RescueClaim =
  | { status: "pending" | "declined"; name: string }
  | { status: "accepted"; name: string; token: string };

/** The phone that asked can read the decision. Another phone cannot. */
export async function claimRecovery(booth: string, requestId: string): Promise<RescueClaim | null> {
  if (!isUuid(booth) || !isUuid(requestId)) return null;
  const rows = await sql<{ status: string; token: string; username: string; booth: string }>(
    `select r.status, r.camera_token as token, r.booth, p.username
     from recovery_requests r
     join profiles p on p.shooter_token = r.camera_token
     where r.id = $1`,
    [requestId],
  );
  const row = rows[0];
  if (!row || String(row.booth) !== booth.toLowerCase()) return null;
  const name = String(row.username);
  if (row.status === "accepted") {
    const token = String(row.token);
    if (!isUuid(token)) return null;
    return { status: "accepted", name, token: token.toLowerCase() };
  }
  if (row.status === "pending" || row.status === "declined") return { status: row.status, name };
  return null;
}

export type RescueRequest = { id: string; name: string; createdAt: number };

export async function listRecoveryRequests(): Promise<RescueRequest[]> {
  const rows = await sql<{ id: string; username: string; created_ms: number | string }>(
    `select r.id, p.username, (extract(epoch from r.created_at) * 1000) as created_ms
     from recovery_requests r
     join profiles p on p.shooter_token = r.camera_token
     where r.status = 'pending'
     order by r.created_at asc
     limit 80`,
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.username),
    createdAt: Math.round(Number(row.created_ms)),
  }));
}

/** True when this rescue was pending and is now decided, or was already that decision. */
export async function decideRecoveryRequest(id: string, status: "accepted" | "declined"): Promise<boolean> {
  const updated = await sql<{ id: string }>(
    `update recovery_requests
     set status = $2, decided_at = now()
     where id = $1 and status = 'pending'
     returning id`,
    [id, status],
  );
  if (updated[0]) return true;
  const current = await sql<{ status: string }>(`select status from recovery_requests where id = $1`, [id]);
  return current[0]?.status === status;
}
