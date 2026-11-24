import { createHash, randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { HttpError } from "@/server/http";

/**
 * Successful creates are counted in the database, not by the shooter id the
 * browser invents. Rotating that id does not open a new window. The global
 * window applies to everyone. The per-network window is best-effort and is
 * skipped when the host did not provide a client address.
 */
const QUOTA = {
  photo: { windowMs: 10 * 60_000, global: 60, perSource: 12 },
  album: { windowMs: 60 * 60_000, global: 20, perSource: 4 },
  event: { windowMs: 60 * 60_000, global: 8, perSource: 2 },
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

async function countSince(kind: CreateKind, windowMs: number, source: string | null): Promise<number> {
  const rows = await sql<{ n: number }>(
    source
      ? `select count(*)::int as n
         from create_log
         where kind = $1
           and source_hash = $2
           and created_at > now() - ($3::int * interval '1 millisecond')`
      : `select count(*)::int as n
         from create_log
         where kind = $1
           and created_at > now() - ($2::int * interval '1 millisecond')`,
    source ? [kind, source, windowMs] : [kind, windowMs],
  );
  const n = rows[0]?.n;
  return typeof n === "number" ? n : Number(n ?? 0);
}

export async function assertCreateAllowed(kind: CreateKind, source: string | null): Promise<void> {
  const rule = QUOTA[kind];
  const globalCount = await countSince(kind, rule.windowMs, null);
  if (globalCount >= rule.global) {
    throw new HttpError(429, "The lab needs a minute. Try again shortly.");
  }
  if (!source) return;
  const sourceCount = await countSince(kind, rule.windowMs, source);
  if (sourceCount >= rule.perSource) {
    throw new HttpError(429, "The lab needs a minute. Try again shortly.");
  }
}

export async function noteCreate(kind: CreateKind, source: string | null): Promise<void> {
  await sql(
    `insert into create_log (id, kind, source_hash) values ($1, $2, $3)`,
    [randomUUID(), kind, source ?? ""],
  );
}
