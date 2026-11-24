import { sql, withTransaction, type Sql } from "@/lib/db";
import { guessMayCompare } from "@/server/gate-key";
import { hashProfilePin } from "@/server/quota";
import { isUuid } from "@/server/validate";

const WINDOW_MS = 15 * 60_000;

function countOf(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function guessFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

export type PinRestore = { ok: true; token: string } | { ok: false; reason: "wrong" | "blocked" };

async function notePin(q: Sql, clientId: string, isNewClient: boolean, fresh: boolean, matches: boolean): Promise<void> {
  if (isNewClient) {
    await q(`insert into pin_client (id, window_start, n) values ($1, now(), $2)`, [clientId, matches ? 0 : 1]);
    return;
  }
  if (matches || fresh) {
    await q(`update pin_client set n = $2, window_start = now() where id = $1`, [clientId, matches ? 0 : 1]);
    return;
  }
  await q(`update pin_client set n = n + 1 where id = $1`, [clientId]);
}

/**
 * A correct PIN returns the camera that already owns that profile.
 * A wrong PIN is counted and not stored. A browser that is already full
 * is refused before the PIN is compared.
 */
export async function takePinRestore(clientId: string, pin: string): Promise<PinRestore> {
  if (!isUuid(clientId)) return { ok: false, reason: "blocked" };
  const hash = await hashProfilePin(pin);
  return withTransaction(async (q) => {
    await q(
      `insert into pin_guess_slot (id, window_start, n) values (1, now(), 0) on conflict (id) do nothing`,
    );
    await q(`select id from pin_guess_slot where id = 1 for update`);
    await q(`delete from pin_client where window_start <= now() - interval '2 hours'`);
    const existing = await q<{ n: number; fresh: boolean | string | number }>(
      `select n,
              window_start <= now() - ($2::int * interval '1 millisecond') as fresh
       from pin_client
       where id = $1
       for update`,
      [clientId, WINDOW_MS],
    );
    const row = existing[0];
    const isNewClient = !row;
    const fresh = guessFlag(row?.fresh);
    const failures = !row || fresh ? 0 : countOf(row.n);
    let otherClients = 0;
    if (isNewClient) {
      const active = await q<{ n: number }>(
        `select count(*)::int as n
         from pin_client
         where n > 0
           and window_start > now() - ($1::int * interval '1 millisecond')`,
        [WINDOW_MS],
      );
      otherClients = countOf(active[0]?.n);
    }
    if (!guessMayCompare(failures, otherClients, isNewClient)) return { ok: false, reason: "blocked" };
    const found = await q<{ shooter_token: string }>(
      `select token as shooter_token from cameras where pin_hash = $1`,
      [hash],
    );
    const token = found[0]?.shooter_token ? String(found[0].shooter_token) : "";
    const matches = isUuid(token);
    await notePin(q, clientId, isNewClient, fresh, matches);
    if (!matches) return { ok: false, reason: "wrong" };
    return { ok: true, token };
  });
}

const CHOICE_LIMIT = 8;

function isPinCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (row.code !== "23505") return false;
  const text = `${row.constraint ?? ""} ${row.message ?? ""}`;
  return text.includes("pin_hash") || text.includes("pin_code");
}

/** The digits the owner can read back. Absent until they choose one. */
export async function readRecoveryPin(token: string): Promise<string | null> {
  const rows = await sql<{ pin_code: string | null }>(`select pin_code from cameras where token = $1`, [token]);
  const pin = rows[0]?.pin_code ? String(rows[0].pin_code) : "";
  return /^\d{6}$/.test(pin) ? pin : null;
}

export type PinSave = "saved" | "taken" | "blocked";

/**
 * Stores the six digits they chose, and the hash the gate compares.
 * A PIN already held by another camera is refused. The old PIN stops matching.
 */
export async function saveRecoveryPin(token: string, pin: string): Promise<PinSave> {
  if (!isUuid(token)) return "blocked";
  const hash = await hashProfilePin(pin);
  try {
    return await withTransaction(async (q) => {
      await q(
        `insert into pin_choice (id, window_start, n) values ($1, now(), 0) on conflict (id) do nothing`,
        [token],
      );
      const budget = await q<{ n: number; fresh: boolean | string | number }>(
        `select n,
                window_start <= now() - ($2::int * interval '1 millisecond') as fresh
         from pin_choice
         where id = $1
         for update`,
        [token, WINDOW_MS],
      );
      const row = budget[0];
      const fresh = guessFlag(row?.fresh);
      const failures = !row || fresh ? 0 : countOf(row.n);
      if (failures >= CHOICE_LIMIT) return "blocked";
      const cameras = await q<{ token: string }>(
        `select token from cameras where (pin_hash = $1 or pin_code = $2) and token <> $3`,
        [hash, pin, token],
      );
      const profiles = await q<{ shooter_token: string }>(
        `select shooter_token from profiles where pin_hash = $1 and shooter_token <> $2`,
        [hash, token],
      );
      if (cameras[0] || profiles[0]) {
        if (fresh) {
          await q(`update pin_choice set n = $2, window_start = now() where id = $1`, [token, failures + 1]);
        } else {
          await q(`update pin_choice set n = $2 where id = $1`, [token, failures + 1]);
        }
        return "taken";
      }
      await q(
        `insert into cameras (token, created_at, pin_code, pin_hash)
         values ($1, now(), $2, $3)
         on conflict (token) do update set pin_code = excluded.pin_code, pin_hash = excluded.pin_hash`,
        [token, pin, hash],
      );
      await q(`update profiles set pin_hash = $2 where shooter_token = $1`, [token, hash]);
      await q(`update pin_choice set n = 0, window_start = now() where id = $1`, [token]);
      return "saved";
    });
  } catch (error) {
    if (isPinCollision(error)) return "taken";
    throw error;
  }
}
