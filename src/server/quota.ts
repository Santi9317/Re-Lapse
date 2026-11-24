import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";
import { isUuid } from "@/server/validate";

/**
 * The browser does not choose a camera id, and a made-up id is not a budget.
 * The server issues a camera, and only when the new-camera window still has
 * room. Sending some other UUID does not insert a row and does not open a
 * window. A camera that was already issued keeps its own photo, roll, event,
 * and profile window. This new-camera window does not spend those, and one
 * camera cannot spend another's. Address headers are not read. When the
 * new-camera window is full, only a brand-new id is refused. Nothing that
 * already belongs to a camera is removed.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, limit: 12 },
  album: { windowMs: 60 * 60_000, limit: 4 },
  event: { windowMs: 60 * 60_000, limit: 2 },
  profile: { windowMs: 60 * 60_000, limit: 4 },
} as const;

const NEW_CAMERA = { windowMs: 10 * 60_000, limit: 24 };

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

export async function issueCamera(presented: string | null): Promise<string> {
  const known = presented && isUuid(presented) ? presented.toLowerCase() : null;
  if (known) {
    const existing = await sql<{ token: string }>(`select token from cameras where token = $1`, [known]);
    if (existing[0]) return String(existing[0].token);
  }
  const token = randomUUID();
  const rows = await sql<{ token: string }>(
    `insert into cameras (token, created_at)
     select $1::text, now()
     where (
       select count(*)::int
       from cameras
       where created_at > now() - ($2::int * interval '1 millisecond')
     ) < $3::int
     returning token`,
    [token, NEW_CAMERA.windowMs, NEW_CAMERA.limit],
  );
  const issued = rows[0]?.token;
  if (!issued) throw new HttpError(429, "New cameras need a minute. Try again shortly.");
  return String(issued);
}

export async function assertCreateAllowed(kind: CreateKind, token: string): Promise<void> {
  const age = await cameraAge(token);
  if (age === "missing") throw new HttpError(403, "This camera hasn't been issued.");
  const rule = QUOTA[kind];
  const own = await countForCamera(kind, rule.windowMs, token);
  if (own >= rule.limit) {
    throw new HttpError(429, "This camera needs a minute. Try again shortly.");
  }
}

export async function noteCreate(kind: CreateKind, token: string): Promise<void> {
  await sql(
    `insert into create_log (id, kind, camera_key) values ($1, $2, $3)`,
    [randomUUID(), kind, token],
  );
}
