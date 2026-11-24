import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";

/**
 * The window belongs to one camera. It never counts anyone else, and there is
 * no shared ceiling. Address headers are ignored: a visitor can put any
 * address in them, so they are not a limit.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, limit: 12 },
  album: { windowMs: 60 * 60_000, limit: 4 },
  event: { windowMs: 60 * 60_000, limit: 2 },
} as const;

export type CreateKind = keyof typeof QUOTA;

async function countForCamera(kind: CreateKind, windowMs: number, token: string): Promise<number> {
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n
     from create_log
     where kind = $1
       and camera_key = $2
       and created_at > now() - ($3::int * interval '1 millisecond')`,
    [kind, token, windowMs],
  );
  const n = rows[0]?.n;
  return typeof n === "number" ? n : Number(n ?? 0);
}

export async function assertCreateAllowed(kind: CreateKind, token: string): Promise<void> {
  const rule = QUOTA[kind];
  const count = await countForCamera(kind, rule.windowMs, token);
  if (count >= rule.limit) {
    throw new HttpError(429, "This camera needs a minute. Try again shortly.");
  }
}

export async function noteCreate(kind: CreateKind, token: string): Promise<void> {
  await sql(
    `insert into create_log (id, kind, camera_key) values ($1, $2, $3)`,
    [randomUUID(), kind, token],
  );
}
