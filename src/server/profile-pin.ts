import { randomInt } from "node:crypto";
import { sql, withTransaction, type Sql } from "@/lib/db";
import { HttpError } from "@/server/http";
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

export async function allocateProfilePin(): Promise<{ pin: string; hash: string }> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pin = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const hash = await hashProfilePin(pin);
    const rows = await sql<{ ok: number }>(`select 1 as ok from profiles where pin_hash = $1`, [hash]);
    if (!rows[0]) return { pin, hash };
  }
  throw new HttpError(500, "The lab hit a snag.");
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
      `select shooter_token from profiles where pin_hash = $1`,
      [hash],
    );
    const token = found[0]?.shooter_token ? String(found[0].shooter_token) : "";
    const matches = isUuid(token);
    await notePin(q, clientId, isNewClient, fresh, matches);
    if (!matches) return { ok: false, reason: "wrong" };
    return { ok: true, token };
  });
}
