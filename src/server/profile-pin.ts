import { sql, withTransaction } from "@/lib/db";
import { pinRestoreOpen } from "@/server/pin";
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

/**
 * A correct PIN returns the camera that already owns that profile.
 * Wrong checks share one gate-wide budget, so a new browser cannot keep guessing.
 * Once that budget is full, the PIN is not looked up.
 */
export async function takePinRestore(pin: string): Promise<PinRestore> {
  const hash = await hashProfilePin(pin);
  return withTransaction(async (q) => {
    await q(
      `insert into pin_guess_slot (id, window_start, n) values (1, now(), 0) on conflict (id) do nothing`,
    );
    const slot = await q<{ n: number; fresh: boolean | string | number }>(
      `select n,
              window_start <= now() - ($1::int * interval '1 millisecond') as fresh
       from pin_guess_slot
       where id = 1
       for update`,
      [WINDOW_MS],
    );
    const fresh = guessFlag(slot[0]?.fresh);
    const recent = fresh ? 0 : countOf(slot[0]?.n);
    if (!pinRestoreOpen(recent)) return { ok: false, reason: "blocked" };
    const found = await q<{ shooter_token: string }>(
      `select token as shooter_token from cameras where pin_hash = $1`,
      [hash],
    );
    const token = found[0]?.shooter_token ? String(found[0].shooter_token) : "";
    const matches = isUuid(token);
    if (!matches) {
      await q(
        `update pin_guess_slot
         set n = $1,
             window_start = case when $2::boolean then now() else window_start end
         where id = 1`,
        [fresh ? 1 : recent + 1, fresh],
      );
      return { ok: false, reason: "wrong" };
    }
    return { ok: true, token };
  });
}

const CHOICE_LIMIT = 8;

function isPinCollision(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (row.code !== "23505") return false;
  const text = `${row.constraint ?? ""} ${row.message ?? ""}`;
  return text.includes("pin_hash");
}

/** Whether this camera has chosen a PIN. The digits are not stored. */
export async function recoveryPinSet(token: string): Promise<boolean> {
  const rows = await sql<{ pin_hash: string | null }>(`select pin_hash from cameras where token = $1`, [token]);
  const hash = rows[0]?.pin_hash ? String(rows[0].pin_hash) : "";
  return /^[0-9a-f]{64}$/i.test(hash);
}

export type PinSave = "saved" | "taken" | "blocked";

/**
 * Stores only the hash the gate compares. The digits are not written.
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
        `select token from cameras where pin_hash = $1 and token <> $2`,
        [hash, token],
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
        `insert into cameras (token, created_at, pin_hash)
         values ($1, now(), $2)
         on conflict (token) do update set pin_hash = excluded.pin_hash`,
        [token, hash],
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
