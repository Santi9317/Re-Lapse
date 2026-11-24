import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";

/**
 * The caller picks the camera id, so a new id must not open a new budget.
 * Cameras that already had frames when they were first seen keep their own
 * window. Every other id, including one minted for a single request, shares
 * one window per kind for its first day. Address headers are not read.
 * The tables also have a hard size, so storage cannot grow without a ceiling.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, perCamera: 12, shared: 60 },
  album: { windowMs: 60 * 60_000, perCamera: 4, shared: 20 },
  event: { windowMs: 60 * 60_000, perCamera: 2, shared: 8 },
} as const;

export type CreateKind = keyof typeof QUOTA;

function asCount(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

async function countForCamera(kind: CreateKind, windowMs: number, token: string): Promise<number> {
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n
     from create_log
     where kind = $1
       and camera_key = $2
       and created_at > now() - ($3::int * interval '1 millisecond')`,
    [kind, token, windowMs],
  );
  return asCount(rows[0]?.n);
}

async function countYoung(kind: CreateKind, windowMs: number): Promise<number> {
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n
     from create_log c
     join cameras cam on cam.token = c.camera_key
     where c.kind = $1
       and c.created_at > now() - ($2::int * interval '1 millisecond')
       and cam.created_at > now() - interval '24 hours'`,
    [kind, windowMs],
  );
  return asCount(rows[0]?.n);
}

async function claimCamera(token: string): Promise<boolean> {
  const rows = await sql<{ young: boolean }>(
    `insert into cameras (token, created_at)
     select $1::text,
       case
         when exists (select 1 from photos where shooter_token = $1::text)
           or exists (select 1 from albums where owner_token = $1::text)
           or exists (select 1 from events where owner_token = $1::text)
         then now() - interval '25 hours'
         else now()
       end
     on conflict (token) do nothing
     returning created_at > now() - interval '24 hours' as young`,
    [token],
  );
  if (rows[0]) return rows[0].young === true || String(rows[0].young) === "t";
  const known = await sql<{ young: boolean }>(
    `select created_at > now() - interval '24 hours' as young
     from cameras
     where token = $1`,
    [token],
  );
  return known[0]?.young === true || String(known[0]?.young) === "t";
}

export async function assertCreateAllowed(kind: CreateKind, token: string): Promise<void> {
  const young = await claimCamera(token);
  const rule = QUOTA[kind];
  const own = await countForCamera(kind, rule.windowMs, token);
  if (own >= rule.perCamera) {
    throw new HttpError(429, "This camera needs a minute. Try again shortly.");
  }
  if (young) {
    const shared = await countYoung(kind, rule.windowMs);
    if (shared >= rule.shared) {
      throw new HttpError(429, "The lab needs a minute. Try again shortly.");
    }
  }
}

export async function noteCreate(kind: CreateKind, token: string): Promise<void> {
  await sql(
    `insert into create_log (id, kind, camera_key) values ($1, $2, $3)`,
    [randomUUID(), kind, token],
  );
}
