import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";

/**
 * The caller picks the camera id, so a new id must not open its own budget.
 * An id is "day-one" until it has been seen for 24 hours. Every day-one id,
 * including one minted for a single request, shares one window. A camera row
 * is written only after that window still has room. Cameras that already had
 * frames when they were first seen keep a separate window. Address headers
 * are not read.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, perCamera: 12, shared: 12 },
  album: { windowMs: 60 * 60_000, perCamera: 4, shared: 4 },
  event: { windowMs: 60 * 60_000, perCamera: 2, shared: 2 },
  profile: { windowMs: 60 * 60_000, perCamera: 4, shared: 12 },
} as const;

export type CreateKind = keyof typeof QUOTA;

function asCount(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function isYoungFlag(value: unknown): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
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

type CameraAge = "missing" | "young" | "settled";

/** A missing camera is day-one. This read does not insert a row. */
async function cameraAge(token: string): Promise<CameraAge> {
  const rows = await sql<{ young: boolean }>(
    `select created_at > now() - interval '24 hours' as young
     from cameras
     where token = $1`,
    [token],
  );
  if (!rows[0]) return "missing";
  return isYoungFlag(rows[0].young) ? "young" : "settled";
}

export async function cameraIsYoung(token: string): Promise<boolean> {
  const age = await cameraAge(token);
  return age !== "settled";
}

async function claimCamera(token: string): Promise<void> {
  await sql(
    `insert into cameras (token, created_at)
     select $1::text,
       case
         when exists (select 1 from photos where shooter_token = $1::text)
           or exists (select 1 from albums where owner_token = $1::text)
           or exists (select 1 from events where owner_token = $1::text)
         then now() - interval '25 hours'
         else now()
       end
     on conflict (token) do nothing`,
    [token],
  );
}

export async function assertCreateAllowed(kind: CreateKind, token: string): Promise<void> {
  const age = await cameraAge(token);
  const rule = QUOTA[kind];
  const own = age === "missing" ? 0 : await countForCamera(kind, rule.windowMs, token);
  if (own >= rule.perCamera) {
    throw new HttpError(429, "This camera needs a minute. Try again shortly.");
  }
  if (age !== "settled") {
    const shared = await countYoung(kind, rule.windowMs);
    if (shared >= rule.shared) {
      throw new HttpError(429, "The lab needs a minute. Try again shortly.");
    }
  }
  if (age === "missing") await claimCamera(token);
}

export async function noteCreate(kind: CreateKind, token: string): Promise<void> {
  await sql(
    `insert into create_log (id, kind, camera_key) values ($1, $2, $3)`,
    [randomUUID(), kind, token],
  );
}
