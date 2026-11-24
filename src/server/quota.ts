import { createHash, randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";

/**
 * Each camera has its own window, so one visitor cannot use up the allowance
 * of every other visitor. When the host sends a client address, that network
 * has a separate window too. There is no shared worldwide counter.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, perCamera: 12, perNetwork: 24 },
  album: { windowMs: 60 * 60_000, perCamera: 4, perNetwork: 8 },
  event: { windowMs: 60 * 60_000, perCamera: 2, perNetwork: 4 },
} as const;

export type CreateKind = keyof typeof QUOTA;

const ADDRESS_HEADERS = ["cf-connecting-ip", "x-real-ip", "x-vercel-forwarded-for", "x-forwarded-for"];

function firstAddress(value: string | null): string | null {
  if (!value) return null;
  const part = value.split(",")[0]?.trim() ?? "";
  if (part.length < 3 || part.length > 64) return null;
  if (!/^[0-9a-fA-F:.]+$/.test(part)) return null;
  return part;
}

export function clientSource(request: Request): string | null {
  for (const name of ADDRESS_HEADERS) {
    const address = firstAddress(request.headers.get(name));
    if (!address) continue;
    return createHash("sha256").update(`relapse-v1\0${address}`).digest("hex");
  }
  return null;
}

async function countCamera(kind: CreateKind, windowMs: number, token: string): Promise<number> {
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

async function countNetwork(kind: CreateKind, windowMs: number, source: string): Promise<number> {
  const rows = await sql<{ n: number }>(
    `select count(*)::int as n
     from create_log
     where kind = $1
       and source_hash = $2
       and created_at > now() - ($3::int * interval '1 millisecond')`,
    [kind, source, windowMs],
  );
  const n = rows[0]?.n;
  return typeof n === "number" ? n : Number(n ?? 0);
}

export async function assertCreateAllowed(kind: CreateKind, token: string, source: string | null): Promise<void> {
  const rule = QUOTA[kind];
  const byCamera = await countCamera(kind, rule.windowMs, token);
  if (byCamera >= rule.perCamera) {
    throw new HttpError(429, "The lab needs a minute. Try again shortly.");
  }
  if (!source) return;
  const byNetwork = await countNetwork(kind, rule.windowMs, source);
  if (byNetwork >= rule.perNetwork) {
    throw new HttpError(429, "The lab needs a minute. Try again shortly.");
  }
}

export async function noteCreate(kind: CreateKind, token: string, source: string | null): Promise<void> {
  await sql(
    `insert into create_log (id, kind, source_hash, camera_key) values ($1, $2, $3, $4)`,
    [randomUUID(), kind, source ?? "", token],
  );
}
